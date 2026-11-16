import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.js';
import { hashSecret } from '../server/lib/security.js';
import { createMailer } from '../server/mailer.js';
import { Store } from '../server/store.js';

let server, base, dir, adminToken;
const ADMIN = 'segredo123';

async function call(method, url, body, token) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const org = (method, url, body) => call(method, `/api/organizer${url}`, body, adminToken);

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'amigo-'));
  const store = new Store(path.join(dir, 'db.json'));
  await store.init();
  const hash = await hashSecret(ADMIN);
  await store.update((db) => {
    db.config.organizerPasswordHash = hash;
  });
  const { app } = createApp({ store, mailer: createMailer({}), publicDir: dir });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

test('rotas do organizador exigem sessão', async () => {
  assert.equal((await call('GET', '/api/organizer/overview')).status, 401);
  assert.equal((await call('POST', '/api/organizer/login', { password: 'errada' })).status, 401);
  const ok = await call('POST', '/api/organizer/login', { password: ADMIN });
  assert.equal(ok.status, 200);
  adminToken = ok.body.token;
});

test('fluxo completo: importar, senhas, sorteio e revelação', async () => {
  const sample = await org('POST', '/participants/sample');
  assert.equal(sample.status, 201);
  assert.equal(sample.body.participants.length, 8);

  const state = await call('GET', '/api/state');
  assert.equal(state.status, 200);
  const serialized = JSON.stringify(state.body);
  assert.ok(!serialized.includes('pinHash') && !serialized.includes('email'), 'estado público não vaza credenciais ou dados privados');

  // Cada participante cria senha 1234, exceto o último (fica sem senha).
  const people = state.body.participants;
  for (const p of people.slice(0, -1)) {
    const claim = await call('POST', `/api/participants/${p.id}/claim`, { pin: '1234', wishlist: `presente de ${p.name}` });
    assert.equal(claim.status, 200);
  }

  // Alterar senha existente exige a senha atual.
  const first = people[0];
  assert.equal((await call('POST', `/api/participants/${first.id}/claim`, { pin: '9999' })).status, 401);
  assert.equal((await call('POST', `/api/participants/${first.id}/claim`, { pin: '9999', currentPin: '1234' })).status, 200);
  await call('POST', `/api/participants/${first.id}/claim`, { pin: '1234', currentPin: '9999' });

  const reveal0 = await call('POST', `/api/participants/${first.id}/reveal`, { pin: '1234' });
  assert.equal(reveal0.body.status, 'pending');

  const draw = await org('POST', '/draw', {});
  assert.equal(draw.status, 200);
  assert.ok(!JSON.stringify(draw.body).includes('receiver'), 'sorteio não revela pares ao organizador');

  // Remover participante com sorteio ativo é bloqueado.
  assert.equal((await org('DELETE', `/participants/${first.id}`)).status, 409);

  const names = new Set();
  for (const p of people.slice(0, -1)) {
    const r = await call('POST', `/api/participants/${p.id}/reveal`, { pin: '1234' });
    assert.equal(r.body.status, 'revealed');
    assert.notEqual(r.body.receiver.name, p.name);
    names.add(r.body.receiver.name);
  }
  assert.equal(names.size, 7);

  const wrong = await call('POST', `/api/participants/${first.id}/reveal`, { pin: '0000' });
  assert.equal(wrong.status, 401);

  const answer = await org('POST', `/draw/reveal/${first.id}`);
  assert.equal(answer.status, 200);
  assert.ok(answer.body.receiverName);

  const cancel = await org('DELETE', '/draw');
  assert.equal(cancel.body.draw.active, false);
});

test('bloqueia força bruta de senha após 5 erros', async () => {
  const { body } = await call('GET', '/api/state');
  const target = body.participants[1];
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', `/api/participants/${target.id}/reveal`, { pin: '0001' });
  assert.equal(last.status, 429);
});

test('validações: e-mail, nome duplicado e envio sem SMTP', async () => {
  assert.equal((await org('POST', '/participants', { name: 'Zé', email: 'invalido' })).status, 400);
  assert.equal((await org('POST', '/participants', { name: 'carlos silva' })).status, 409);
  assert.equal((await org('POST', '/draw', { sendEmails: true })).status, 400);

  // Adição com minúsculas é salva capitalizada
  const created = await org('POST', '/participants', { name: 'joão da silva pereira', family: 'família silva' });
  assert.equal(created.status, 201);
  const found = created.body.participants.find(p => p.name === 'João da Silva Pereira');
  assert.ok(found);
  assert.equal(found.family, 'Família Silva');
});

test('trocar senha do organizador exige a atual e invalida sessões antigas', async () => {
  const cfg = { eventName: 'Natal', newPassword: 'novaSenha1', currentPassword: 'errada' };
  assert.equal((await org('PUT', '/config', cfg)).status, 401);
  const ok = await org('PUT', '/config', { ...cfg, currentPassword: ADMIN });
  assert.equal(ok.status, 200);
  const old = adminToken;
  adminToken = ok.body.token;
  assert.equal((await call('GET', '/api/organizer/overview', null, old)).status, 401);
  assert.equal((await org('GET', '/overview')).status, 200);
});
