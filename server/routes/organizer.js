import { Router } from 'express';
import { DrawError, findOversizedFamily, runDraw } from '../lib/draw.js';
import { HttpError, badRequest, conflict, unauthorized } from '../lib/errors.js';
import { parseParticipantList } from '../lib/parser.js';
import { hashSecret, verifySecret } from '../lib/security.js';
import { cleanEmail, cleanPassword, cleanText, cleanUrl, toTitleCase } from '../lib/validation.js';
import { assertUniqueName, canonicalFamily, createParticipant, findParticipant } from '../participants.js';
import { byName, drawSummary, eventView, organizerParticipant } from '../serializers.js';

const SAMPLE_PEOPLE = [
  ['Carlos Silva', 'Família Silva'],
  ['Mariana Silva', 'Família Silva'],
  ['Pedro Silva', 'Família Silva'],
  ['Ana Souza', 'Família Souza'],
  ['Lucas Souza', 'Família Souza'],
  ['Beatriz Lima', 'Família Lima'],
  ['Rafael Lima', 'Família Lima'],
  ['João Santos', '']
];

export function organizerRoutes({ store, mailer, sessions, loginLimiter }) {
  const router = Router();

  // ---------- Autenticação ----------
  router.post('/login', async (req, res) => {
    const wait = loginLimiter.retryAfter(req.ip);
    if (wait) throw new HttpError(429, `Muitas tentativas. Tente novamente em ${Math.ceil(wait / 60)} min.`);

    const ok = await verifySecret(req.body?.password, store.state.config.organizerPasswordHash);
    if (!ok) {
      loginLimiter.fail(req.ip);
      throw unauthorized('Senha do organizador incorreta.');
    }
    loginLimiter.reset(req.ip);
    res.json({ token: sessions.create() });
  });

  router.use((req, _res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!sessions.validate(token)) return next(unauthorized('Sessão expirada. Entre novamente.'));
    req.sessionToken = token;
    next();
  });

  router.post('/logout', (req, res) => {
    sessions.revoke(req.sessionToken);
    res.json({ ok: true });
  });

  // ---------- Visão geral ----------
  const overview = () => {
    const { config, participants, draw } = store.state;
    return {
      event: { ...eventView(config), publicBaseUrl: config.publicBaseUrl },
      email: { configured: mailer.configured, sender: mailer.sender, fromName: mailer.fromName },
      participants: [...participants].sort(byName).map(organizerParticipant),
      oversizedFamily: findOversizedFamily(participants),
      draw: drawSummary(draw, participants)
    };
  };

  router.get('/overview', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(overview());
  });

  // ---------- Configurações ----------
  router.put('/config', async (req, res) => {
    const body = req.body ?? {};
    const update = {
      eventName: cleanText(body.eventName, { max: 80, required: true, label: 'O nome do evento' }),
      suggestedBudget: cleanText(body.suggestedBudget, { max: 40, label: 'O valor sugerido' }),
      eventDate: cleanText(body.eventDate, { max: 80, label: 'A data' }),
      eventLocation: cleanText(body.eventLocation, { max: 120, label: 'O local' }),
      publicBaseUrl: cleanUrl(body.publicBaseUrl)
    };

    let newHash = null;
    if (body.newPassword) {
      cleanPassword(body.newPassword, 'A nova senha');
      if (!(await verifySecret(body.currentPassword, store.state.config.organizerPasswordHash))) {
        throw unauthorized('A senha atual do organizador está incorreta.');
      }
      newHash = await hashSecret(body.newPassword);
    }

    await store.update((db) => {
      Object.assign(db.config, update);
      if (newHash) db.config.organizerPasswordHash = newHash;
    });

    const response = { ok: true, ...overview() };
    if (newHash) {
      sessions.revokeAll();
      response.token = sessions.create();
    }
    res.json(response);
  });

  // ---------- Participantes ----------
  router.post('/participants', async (req, res) => {
    const input = {
      name: cleanText(req.body?.name, { max: 80, required: true, label: 'O nome' }),
      family: cleanText(req.body?.family, { max: 60, label: 'A família' }),
      email: cleanEmail(req.body?.email)
    };
    await store.update((db) => createParticipant(db, input));
    res.status(201).json(overview());
  });

  router.post('/participants/bulk', async (req, res) => {
    const rawText = String(req.body?.text ?? '');
    if (!rawText.trim()) throw badRequest('Cole ao menos um nome.');
    if (rawText.length > 20_000) throw badRequest('A lista é grande demais.');
    const defaultFamily = cleanText(req.body?.defaultFamily, { max: 60, label: 'A família padrão' });

    const parsed = parseParticipantList(rawText, defaultFamily);
    if (!parsed.length) throw badRequest('Nenhum nome válido encontrado.');

    const result = await store.update((db) => {
      const summary = { added: 0, skipped: [] };
      for (const item of parsed) {
        try {
          createParticipant(db, {
            name: cleanText(item.name, { max: 80, label: 'O nome' }),
            family: cleanText(item.family, { max: 60, label: 'A família' })
          });
          summary.added += 1;
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          summary.skipped.push(item.name);
        }
      }
      return summary;
    });

    res.json({ ...result, ...overview() });
  });

  router.post('/participants/sample', async (_req, res) => {
    await store.update((db) => {
      if (db.participants.length) throw conflict('O exemplo só pode ser carregado com a lista vazia.');
      for (const [name, family] of SAMPLE_PEOPLE) createParticipant(db, { name, family });
    });
    res.status(201).json(overview());
  });

  router.patch('/participants/:id', async (req, res) => {
    const body = req.body ?? {};
    await store.update((db) => {
      const target = findParticipant(db, req.params.id);
      if (body.name !== undefined) {
        const name = toTitleCase(cleanText(body.name, { max: 80, required: true, label: 'O nome' }));
        assertUniqueName(db.participants, name, target.id);
        target.name = name;
      }
      if (body.family !== undefined) {
        if (db.draw) throw conflict('Alterar a família com sorteio ativo pode invalidar as regras. Cancele o sorteio primeiro.');
        const others = db.participants.filter((p) => p.id !== target.id);
        target.family = canonicalFamily(others, cleanText(body.family, { max: 60, label: 'A família' }));
      }
      if (body.email !== undefined) target.email = cleanEmail(body.email);
    });
    res.json(overview());
  });

  router.post('/participants/:id/reset-pin', async (req, res) => {
    await store.update((db) => {
      findParticipant(db, req.params.id).pinHash = '';
    });
    res.json(overview());
  });

  router.delete('/participants/:id', async (req, res) => {
    await store.update((db) => {
      findParticipant(db, req.params.id);
      if (db.draw) throw conflict('Há um sorteio ativo. Cancele o sorteio antes de remover participantes.');
      db.participants = db.participants.filter((p) => p.id !== req.params.id);
    });
    res.json(overview());
  });

  router.delete('/participants', async (_req, res) => {
    await store.update((db) => {
      db.participants = [];
      db.draw = null;
    });
    res.json(overview());
  });

  // ---------- Sorteio ----------
  router.post('/draw', async (req, res) => {
    const sendEmails = req.body?.sendEmails === true;
    if (sendEmails && !mailer.configured) {
      throw badRequest('O envio de e-mails não está configurado (defina SMTP_* no .env).');
    }

    let pairs;
    try {
      pairs = runDraw(store.state.participants);
    } catch (err) {
      if (err instanceof DrawError) throw new HttpError(422, err.message);
      throw err;
    }

    await store.update((db) => {
      db.draw = { id: Date.now().toString(36), date: new Date().toISOString(), pairs };
    });

    const { participants, config } = store.state;
    const event = eventView(config);
    const report = [];

    for (const giver of [...participants].sort(byName)) {
      const entry = { id: giver.id, name: giver.name, status: 'site' };
      if (sendEmails && giver.email) {
        const receiver = participants.find((p) => p.id === pairs.find((x) => x.giverId === giver.id).receiverId);
        try {
          await mailer.sendDraw({ giver, receiver, event });
          entry.status = 'email_sent';
        } catch (err) {
          console.error(`Falha ao enviar e-mail para ${giver.email}: ${err.message}`);
          entry.status = 'email_failed';
        }
      }
      report.push(entry);
    }

    res.json({ ok: true, report, ...overview() });
  });

  router.delete('/draw', async (_req, res) => {
    await store.update((db) => {
      db.draw = null;
    });
    res.json(overview());
  });

  /** Gabarito de emergência: revela um único par por vez. */
  router.post('/draw/reveal/:giverId', (req, res) => {
    const { draw, participants } = store.state;
    if (!draw) throw conflict('Não há sorteio ativo.');
    const pair = draw.pairs.find((p) => p.giverId === req.params.giverId);
    if (!pair) throw badRequest('Esta pessoa não participou do sorteio atual.');
    const receiver = participants.find((p) => p.id === pair.receiverId);
    res.json({ receiverName: receiver.name });
  });

  router.post('/email/test', async (req, res) => {
    const to = cleanEmail(req.body?.to);
    if (!to) throw badRequest('Informe um e-mail para receber o teste.');
    try {
      await mailer.sendTest(to, eventView(store.state.config));
    } catch (err) {
      throw new HttpError(502, `Falha no envio: ${err.message}`);
    }
    res.json({ ok: true, message: `E-mail de teste enviado para ${to}.` });
  });

  return router;
}
