import { Router } from 'express';
import { HttpError, conflict } from '../lib/errors.js';
import { verifySecret, hashSecret } from '../lib/security.js';
import { cleanEmail, cleanParticipantPin, cleanText } from '../lib/validation.js';
import { findParticipant } from '../participants.js';
import { byName, drawSummary, eventView, publicParticipant } from '../serializers.js';

export function publicRoutes({ store, mailer, pinLimiter }) {
  const router = Router();

  /** Valida a senha de 4 dígitos do participante, com bloqueio após falhas repetidas. */
  async function authenticateParticipant(req, participant, pin, { required = true } = {}) {
    const key = `${participant.id}:${req.ip}`;
    const wait = pinLimiter.retryAfter(key);
    if (wait) {
      throw new HttpError(429, `Muitas tentativas incorretas. Tente novamente em ${Math.ceil(wait / 60)} min.`);
    }
    if (!participant.pinHash) {
      if (required) throw conflict('Você ainda não criou sua senha de 4 dígitos.');
      return;
    }
    if (!(await verifySecret(pin, participant.pinHash))) {
      pinLimiter.fail(key);
      throw new HttpError(401, 'Senha incorreta.');
    }
    pinLimiter.reset(key);
  }

  router.get('/state', (_req, res) => {
    const { config, participants, draw } = store.state;
    res.set('Cache-Control', 'no-store');
    res.json({
      event: eventView(config),
      participants: [...participants].sort(byName).map(publicParticipant),
      draw: drawSummary(draw, participants)
    });
  });

  router.post('/participants/:id/claim', async (req, res) => {
    const { pin, currentPin, email, wishlist } = req.body ?? {};
    const newPin = cleanParticipantPin(pin);
    const cleanedEmail = cleanEmail(email);
    const cleanedWishlist =
      wishlist === undefined ? undefined : cleanText(wishlist, { max: 200, label: 'A sugestão de presente' });

    const existing = findParticipant(store.state, req.params.id);
    await authenticateParticipant(req, existing, currentPin, { required: false });
    const pinHash = await hashSecret(newPin);

    const participant = await store.update((db) => {
      const target = findParticipant(db, req.params.id);
      target.pinHash = pinHash;
      if (cleanedWishlist !== undefined) target.wishlist = cleanedWishlist;
      if (cleanedEmail) target.email = cleanedEmail;
      return { ...target };
    });

    // Sorteio já realizado e e-mail disponível: envia o resultado em segundo plano.
    const { draw, participants, config } = store.state;
    const pair = draw?.pairs.find((p) => p.giverId === participant.id);
    if (pair && participant.email && mailer.configured) {
      const receiver = participants.find((p) => p.id === pair.receiverId);
      mailer
        .sendDraw({ giver: participant, receiver, event: eventView(config) })
        .catch((err) => console.error(`Falha ao enviar e-mail para ${participant.email}: ${err.message}`));
    }

    res.json({ ok: true, drawActive: Boolean(draw) });
  });

  router.post('/participants/:id/reveal', async (req, res) => {
    const participant = findParticipant(store.state, req.params.id);
    await authenticateParticipant(req, participant, req.body?.pin);

    const { draw, participants, config } = store.state;
    const base = { event: eventView(config), myWishlist: participant.wishlist };
    if (!draw) return res.json({ ...base, status: 'pending' });

    const pair = draw.pairs.find((p) => p.giverId === participant.id);
    if (!pair) return res.json({ ...base, status: 'not_in_draw' });

    const receiver = participants.find((p) => p.id === pair.receiverId);
    res.json({
      ...base,
      status: 'revealed',
      receiver: { name: receiver.name, wishlist: receiver.wishlist }
    });
  });

  router.put('/participants/:id/wishlist', async (req, res) => {
    const wishlist = cleanText(req.body?.wishlist, { max: 200, label: 'A sugestão de presente' });
    const participant = findParticipant(store.state, req.params.id);
    await authenticateParticipant(req, participant, req.body?.pin);

    await store.update((db) => {
      findParticipant(db, req.params.id).wishlist = wishlist;
    });
    res.json({ ok: true, wishlist });
  });

  return router;
}
