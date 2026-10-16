import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom, REFRESH_COOKIE } from '../middleware/auth';
import { issueCsrfToken } from '../middleware/csrf';
import * as authService from '../services/auth.service';
import { errors } from '../utils/errors';
import { env } from '../config/env';

function ctx(req: Request) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

export const csrf = asyncHandler(async (_req: Request, res: Response) => {
  const token = issueCsrfToken(res);
  res.json({ data: { csrfToken: token } });
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, phone, password } = req.body;
  const { user, tokens } = await authService.registerCustomer({ name, email, phone, password }, ctx(req));
  authService.setAuthCookies(res, tokens);
  issueCsrfToken(res);
  res.status(201).json({ data: { user } });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { user, tokens } = await authService.login(email, password, ctx(req));
  authService.setAuthCookies(res, tokens);
  issueCsrfToken(res);
  res.json({ data: { user } });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw errors.sessionExpired();
  const { user, tokens } = await authService.refreshSession(token, ctx(req));
  authService.setAuthCookies(res, tokens);
  issueCsrfToken(res);
  res.json({ data: { user } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await authService.logout(req.user.id, req.user.sessionId);
  }
  authService.clearAuthCookies(res);
  res.json({ data: { success: true } });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const user = await authService.getMe(req.user.id);
  res.json({ data: { user } });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const baseUrl = `${env().CLIENT_ORIGINS.split(',')[0].trim()}/reset-password`;
  await authService.forgotPassword(email, baseUrl);
  res.json({
    data: { success: true, message: 'If an account exists for that email, a reset link has been sent.' },
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.json({ data: { success: true, message: 'Password updated. Please sign in.' } });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(actor.userId, currentPassword, newPassword, req.user?.sessionId);
  res.json({ data: { success: true } });
});

export const revokeSessions = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  await authService.revokeAllSessions(actor.userId, req.user?.sessionId);
  res.json({ data: { success: true } });
});
