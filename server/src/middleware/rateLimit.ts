import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { RequestHandler } from 'express';
import { env, isTest } from '../config/env';
import { errors } from '../utils/errors';

function limiter(windowMs: number, max: number, name: string, keyIpOnly = true): RateLimitRequestHandler | null {
  if (isTest() || !env().RATE_LIMIT_ENABLED) return null;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyIpOnly ? undefined : (req) => `${req.ip}:${(req.body as { email?: string })?.email?.toLowerCase() ?? ''}`,
    handler: (_req, _res, next) => next(errors.rateLimited()),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
  });
}

export const apiLimiter = limiter(15 * 60 * 1000, 600, 'api');
export const authLimiter = limiter(15 * 60 * 1000, 30, 'auth');
export const strictAuthLimiter = limiter(15 * 60 * 1000, 12, 'strict-auth', false);
export const bookingLimiter = limiter(60 * 60 * 1000, 30, 'booking');
export const uploadLimiter = limiter(15 * 60 * 1000, 40, 'upload');
export const writeLimiter = limiter(15 * 60 * 1000, 200, 'write');

/** Apply a limiter only when it is enabled (null in tests). */
export function maybe(l: RateLimitRequestHandler | null): RequestHandler {
  if (l) return l as unknown as RequestHandler;
  return (_req, _res, next) => next();
}
