import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import path from 'path';
import { env } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { router as paymentWebhookRouter } from './routes/payment-webhook.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { csrfProtection, CSRF_COOKIE, issueCsrfToken } from './middleware/csrf';
import { apiLimiter, maybe } from './middleware/rateLimit';
import { UPLOAD_DIR } from './middleware/upload';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // API only; the SPA is served separately
    })
  );

  const origins = env()
    .CLIENT_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || origins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
      maxAge: 86400,
    })
  );

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Webhook: raw body BEFORE json parsing (signature verification needs raw bytes)
  app.use('/api/payments/webhook', paymentWebhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // Ensure a readable CSRF cookie exists for the SPA (double-submit pattern)
  app.use((req, res, next) => {
    if (!req.cookies?.[CSRF_COOKIE]) issueCsrfToken(res);
    next();
  });
  app.use(csrfProtection);

  app.use('/uploads', express.static(path.resolve(UPLOAD_DIR), { maxAge: '7d', index: false }));

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok', time: new Date().toISOString(), uptime: process.uptime() } });
  });

  app.use('/api', maybe(apiLimiter), apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
