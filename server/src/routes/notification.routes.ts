import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/notification.controller';
import {
  emailLogListQuery,
  notificationIdParams,
  notificationListQuery,
} from '../validators/notification.validators';

export const router = Router();

router.get('/', requireAuth, validate({ query: notificationListQuery }), ctrl.list);
router.post('/read-all', requireAuth, ctrl.readAll);
router.patch(
  '/:id/read',
  requireAuth,
  validate({ params: notificationIdParams }),
  ctrl.markRead
);
router.get(
  '/email-logs',
  requireAuth,
  requirePermission('notifications.view'),
  validate({ query: emailLogListQuery }),
  ctrl.emailLogs
);
router.post(
  '/email-logs/:id/retry',
  requireAuth,
  requirePermission('notifications.view'),
  ctrl.retryEmailLog
);
