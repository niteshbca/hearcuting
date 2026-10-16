import { NextFunction, Request, RequestHandler, Response } from 'express';
import { User } from '../models/User';
import { errors } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/tokens';
import { isStaffRole, Permission, roleHasPermission, Role } from '../utils/permissions';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  customerId?: string;
  staffId?: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const ACCESS_COOKIE = 'sp_at';
export const REFRESH_COOKIE = 'sp_rt';

/**
 * Authenticates the request from the HttpOnly access-token cookie.
 * Session revocation is enforced by checking the token's session id (jti)
 * against the user's active sessions on every request.
 */
export const requireAuth: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw errors.unauthorized('Authentication required');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw errors.sessionExpired();
    }

    const user = await User.findById(payload.sub).lean();
    if (!user || !user.isActive) throw errors.unauthorized('Account is inactive');

    const sessionActive = user.sessions?.some(
      (s) => s.jti === payload.jti && !s.revokedAt && s.expiresAt > new Date()
    );
    if (!sessionActive) throw errors.sessionExpired();

    req.user = {
      id: String(user._id),
      role: user.role as Role,
      name: user.name,
      email: user.email,
      customerId: user.customer ? String(user.customer) : undefined,
      staffId: user.staff ? String(user.staff) : undefined,
      sessionId: payload.jti,
    };
    next();
  }
);

/** Attaches req.user when a valid session exists, otherwise continues anonymously. */
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  try {
    await requireAuth(req, _res, next);
  } catch {
    req.user = undefined;
    next();
  }
});

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(errors.unauthorized());
    if (!roles.includes(req.user.role)) return next(errors.forbidden());
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(errors.unauthorized());
    if (!roleHasPermission(user.role, permission)) {
      return next(errors.forbidden(`Missing permission: ${permission}`));
    }
    next();
  };
}

export function requireAnyPermission(...perms: Permission[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(errors.unauthorized());
    if (!perms.some((p) => roleHasPermission(user.role, p))) {
      return next(errors.forbidden());
    }
    next();
  };
}

export function actorFrom(req: Request) {
  const u = req.user;
  if (!u) throw errors.unauthorized();
  return { userId: u.id, role: u.role, ip: req.ip, userAgent: req.get('user-agent') };
}

export { isStaffRole };
