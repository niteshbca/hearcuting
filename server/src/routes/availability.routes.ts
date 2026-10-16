import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import { maybe, bookingLimiter } from '../middleware/rateLimit';
import * as ctrl from '../controllers/availability.controller';
import {
  calendarQuerySchema,
  slotsQuerySchema,
  staffDayQuerySchema,
} from '../validators/availability.validators';

export const router = Router();

router.get('/slots', maybe(bookingLimiter), validate({ query: slotsQuerySchema }), ctrl.slots);
router.get(
  '/calendar',
  requireAuth,
  requirePermission('appointments.view'),
  validate({ query: calendarQuerySchema }),
  ctrl.calendar
);
router.get(
  '/staff-day',
  requireAuth,
  requireRole('owner', 'manager', 'barber'),
  validate({ query: staffDayQuerySchema }),
  ctrl.staffDay
);
