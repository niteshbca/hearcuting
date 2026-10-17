import { NextFunction, Request, RequestHandler, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

export const CSRF_COOKIE = 'sp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by the SPA client
    // sameSite: 'lax',
    // secure: env().NODE_ENV === 'production',
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
  return token;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Double-submit CSRF protection for cookie-based sessions.
 * Expects the readable `sp_csrf` cookie to be echoed in the `x-csrf-token`
 * header on every state-changing request.
 */
export const csrfProtection: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return next(
      new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token. Refresh the page and retry.')
    );
  }
  next();
};
