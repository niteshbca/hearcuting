import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { Types } from 'mongoose';
import { User, UserDoc } from '../models/User';
import { CustomerProfile } from '../models/CustomerProfile';
import { AppError, errors } from '../utils/errors';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../middleware/auth';
import { env } from '../config/env';
import {
  hashToken,
  newSessionId,
  randomToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import { logAudit } from './audit.service';
import { enqueueEmail } from './mail.service';
import { templates } from '../templates/email';
import { getSettings } from './settings.service';

const BCRYPT_ROUNDS = 12;
const MAX_SESSIONS = 8;

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  const e = env();
  const secure = e.NODE_ENV === 'production';
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: e.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/api/auth',
    maxAge: e.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export function publicUser(user: UserDoc) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: user.avatarUrl ?? null,
    customerId: user.customer ? String(user.customer) : undefined,
    staffId: user.staff ? String(user.staff) : undefined,
    isEmailVerified: user.isEmailVerified,
  };
}

async function issueSession(user: UserDoc, ctx: SessionContext): Promise<{ accessToken: string; refreshToken: string }> {
  const jti = newSessionId();
  const refreshToken = signRefreshToken({ sub: String(user._id), jti });
  const expiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  user.sessions = (user.sessions ?? []).filter((s) => s.expiresAt > new Date() && !s.revokedAt);
  if (user.sessions.length >= MAX_SESSIONS) {
    user.sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const revokeCount = user.sessions.length - MAX_SESSIONS + 1;
    for (let i = 0; i < revokeCount; i++) user.sessions[i].revokedAt = new Date();
  }
  user.sessions.push({
    jti,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: ctx.userAgent?.slice(0, 250),
    ip: ctx.ip,
    createdAt: new Date(),
    expiresAt,
  });
  user.lastLoginAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  return {
    accessToken: signAccessToken({ sub: String(user._id), role: user.role, jti }),
    refreshToken,
  };
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export async function registerCustomer(input: RegisterInput, ctx: SessionContext) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email }).select('_id').lean();
  if (existing) throw errors.conflict('An account with this email already exists');

  const user = await User.create({
    email,
    name: input.name.trim(),
    phone: input.phone.trim(),
    passwordHash: await hashPassword(input.password),
    role: 'customer',
    isEmailVerified: false,
  });

  const profile = await CustomerProfile.create({
    user: user._id,
    name: user.name,
    email,
    phone: user.phone,
    source: 'website',
  });
  user.customer = profile._id;
  await user.save();

  await logAudit({
    actor: { userId: String(user._id), role: user.role, ...ctx },
    action: 'auth.register',
    entity: 'User',
    entityId: String(user._id),
  });

  const tokens = await issueSession(user, ctx);
  return { user: publicUser(user), tokens };
}

export async function login(email: string, password: string, ctx: SessionContext) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user) throw errors.invalidCredentials();

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= 8) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw errors.invalidCredentials();
  }

  if (!user.isActive) throw errors.forbidden('Your account has been deactivated. Contact the salon owner.');

  const tokens = await issueSession(user, ctx);
  await logAudit({
    actor: { userId: String(user._id), role: user.role, ...ctx },
    action: 'auth.login',
    entity: 'User',
    entityId: String(user._id),
  });
  return { user: publicUser(user), tokens };
}

export async function refreshSession(refreshToken: string, ctx: SessionContext) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw errors.sessionExpired();
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw errors.sessionExpired();

  const session = user.sessions.find((s) => s.jti === payload.jti);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw errors.sessionExpired();
  if (session.refreshTokenHash !== hashToken(refreshToken)) {
    // Token reuse detected — revoke the whole session chain.
    session.revokedAt = new Date();
    await user.save();
    throw errors.sessionExpired();
  }

  session.revokedAt = new Date();
  const tokens = await issueSession(user, ctx);
  return { user: publicUser(user), tokens };
}

export async function logout(userId: string, sessionId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { 'sessions.$[s].revokedAt': new Date() } }, {
    arrayFilters: [{ 's.jti': sessionId }],
  });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;
  for (const s of user.sessions) {
    if (!exceptSessionId || s.jti !== exceptSessionId) s.revokedAt = new Date();
  }
  await user.save();
}

export async function forgotPassword(email: string, resetBaseUrl: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.isActive) return; // do not leak account existence

  const token = randomToken(32);
  user.passwordReset = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  await user.save();

  const resetUrl = `${resetBaseUrl}?token=${token}`;
  const settings = await getSettings();
  const content = templates.passwordReset(user.name, resetUrl, settings);
  await enqueueEmail({
    to: user.email,
    toName: user.name,
    subject: content.subject,
    html: content.html,
    text: content.text,
    template: 'password_reset',
    relatedType: 'User',
    relatedId: String(user._id),
    dedupeKey: `password_reset:${String(user._id)}:${user.passwordReset.expiresAt.getTime()}`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const user = await User.findOne({
    'passwordReset.tokenHash': hashToken(token),
    'passwordReset.expiresAt': { $gt: new Date() },
    'passwordReset.usedAt': { $exists: false },
  });
  if (!user) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');

  user.passwordHash = await hashPassword(newPassword);
  if (user.passwordReset) user.passwordReset.usedAt = new Date();
  for (const s of user.sessions) s.revokedAt = new Date();
  await user.save();
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionId?: string
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw errors.unauthorized();
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new AppError(400, 'INVALID_PASSWORD', 'Your current password is incorrect');

  user.passwordHash = await hashPassword(newPassword);
  for (const s of user.sessions) {
    if (!keepSessionId || s.jti !== keepSessionId) s.revokedAt = new Date();
  }
  await user.save();
}

export async function getMe(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw errors.unauthorized();
  return publicUser(user as unknown as UserDoc);
}

export function newObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
