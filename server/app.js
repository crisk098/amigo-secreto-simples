import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { HttpError } from './lib/errors.js';
import { AttemptLimiter, SessionManager } from './lib/security.js';
import { organizerRoutes } from './routes/organizer.js';
import { publicRoutes } from './routes/public.js';

export function createApp({ store, mailer, publicDir, trustProxy = false }) {
  const app = express();
  const sessions = new SessionManager();
  const loginLimiter = new AttemptLimiter({ maxFailures: 5, lockMs: 10 * 60 * 1000 });
  const pinLimiter = new AttemptLimiter({ maxFailures: 5, lockMs: 10 * 60 * 1000 });

  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      }
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(publicDir, { extensions: ['html'], maxAge: 0 }));

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/organizer', organizerRoutes({ store, mailer, sessions, loginLimiter }));
  app.use('/api', publicRoutes({ store, mailer, pinLimiter }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requisição grande demais.' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return { app, sessions };
}

export const defaultPublicDir = (rootDir) => path.join(rootDir, 'public');
