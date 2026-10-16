import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter, maybe, strictAuthLimiter } from '../middleware/rateLimit';
import * as ctrl from '../controllers/auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validators';

export const router = Router();

router.get('/csrf', ctrl.csrf);
router.post('/register', maybe(authLimiter), validate({ body: registerSchema }), ctrl.register);
router.post('/login', maybe(strictAuthLimiter), validate({ body: loginSchema }), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', requireAuth, ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/forgot-password', maybe(strictAuthLimiter), validate({ body: forgotPasswordSchema }), ctrl.forgotPassword);
router.post('/reset-password', maybe(strictAuthLimiter), validate({ body: resetPasswordSchema }), ctrl.resetPassword);
router.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), ctrl.changePassword);
router.post('/revoke-sessions', requireAuth, ctrl.revokeSessions);
