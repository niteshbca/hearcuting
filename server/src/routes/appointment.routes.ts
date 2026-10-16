import { Router } from 'express';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireAnyPermission, requirePermission, requireRole } from '../middleware/auth';
import { maybe, bookingLimiter } from '../middleware/rateLimit';
import * as ctrl from '../controllers/appointment.controller';
import {
  assignBodySchema,
  cancelBodySchema,
  createBookingBodySchema,
  idParamsSchema,
  listQuerySchema,
  manageQuerySchema,
  patchBodySchema,
  rescheduleBodySchema,
  statusBodySchema,
  walkInBodySchema,
} from '../validators/appointment.validators';

export const router = Router();

// Literal routes first — `/:reference` must never shadow them.
router.post(
  '/',
  maybe(bookingLimiter),
  optionalAuth,
  validate({ body: createBookingBodySchema }),
  ctrl.create
);
router.get('/mine', requireAuth, requireRole('customer'), validate({ query: listQuerySchema }), ctrl.mine);

router.get('/:reference', maybe(bookingLimiter), ctrl.getOne);
router.get('/:reference/manage', maybe(bookingLimiter), validate({ query: manageQuerySchema }), ctrl.manage);
router.post(
  '/:reference/reschedule',
  maybe(bookingLimiter),
  optionalAuth,
  validate({ body: rescheduleBodySchema }),
  ctrl.reschedule
);
router.post('/:reference/cancel', maybe(bookingLimiter), optionalAuth, validate({ body: cancelBodySchema }), ctrl.cancel);

router.get(
  '/',
  requireAuth,
  requirePermission('appointments.view'),
  validate({ query: listQuerySchema }),
  ctrl.list
);
router.post(
  '/walk-in',
  requireAuth,
  requirePermission('appointments.create'),
  validate({ body: walkInBodySchema }),
  ctrl.walkIn
);

router.patch(
  '/:id/status',
  requireAuth,
  requireAnyPermission('appointments.update', 'appointments.update.own'),
  validate({ params: idParamsSchema, body: statusBodySchema }),
  ctrl.updateStatus
);
router.patch(
  '/:id/assign',
  requireAuth,
  requirePermission('appointments.assign'),
  validate({ params: idParamsSchema, body: assignBodySchema }),
  ctrl.assign
);
router.patch(
  '/:id',
  requireAuth,
  requirePermission('appointments.update'),
  validate({ params: idParamsSchema, body: patchBodySchema }),
  ctrl.update
);
router.post(
  '/:id/remind',
  requireAuth,
  requirePermission('appointments.update'),
  validate({ params: idParamsSchema }),
  ctrl.remind
);
router.get(
  '/:id/history',
  requireAuth,
  requirePermission('appointments.view'),
  validate({ params: idParamsSchema }),
  ctrl.history
);
