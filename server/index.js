import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, defaultPublicDir } from './app.js';
import { generatePassword, hashSecret } from './lib/security.js';
import { createMailer } from './mailer.js';
import { Store } from './store.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 3000;

const store = new Store(path.join(rootDir, 'data', 'db.json'));
await store.init();

// Primeira execução: define a senha do organizador.
let generatedPassword = null;
if (!store.state.config.organizerPasswordHash) {
  const fromEnv = process.env.ORGANIZER_PASSWORD?.trim();
  const password = fromEnv && fromEnv.length >= 6 ? fromEnv : (generatedPassword = generatePassword());
  const hash = await hashSecret(password);
  await store.update((db) => {
    db.config.organizerPasswordHash = hash;
  });
}

const mailer = createMailer();
const { app } = createApp({
  store,
  mailer,
  publicDir: defaultPublicDir(rootDir),
  trustProxy: process.env.TRUST_PROXY === '1'
});

app.listen(port, () => {
  console.log('\n🎁  Amigo Secreto rodando');
  console.log(`    Local: http://localhost:${port}`);
  console.log(`    E-mail: ${mailer.configured ? `ativo (${mailer.sender})` : 'desativado (consulta pelo site)'}`);
  if (generatedPassword) {
    console.log(`\n🔑  Senha do organizador gerada: ${generatedPassword}`);
    console.log('    (exibida apenas agora — altere em Configurações após entrar)\n');
  }
});
