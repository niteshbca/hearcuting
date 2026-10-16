import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  jti: string; // session id
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

export function newSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'access' }, env().JWT_SECRET, {
    expiresIn: `${env().ACCESS_TOKEN_TTL_MINUTES}m`,
    issuer: 'salonpro',
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, env().JWT_REFRESH_SECRET, {
    expiresIn: `${env().REFRESH_TOKEN_TTL_DAYS}d`,
    issuer: 'salonpro',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env().JWT_SECRET, { issuer: 'salonpro' }) as AccessTokenPayload;
  if (payload.typ !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env().JWT_REFRESH_SECRET, {
    issuer: 'salonpro',
  }) as RefreshTokenPayload;
  if (payload.typ !== 'refresh') throw new Error('Invalid token type');
  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
