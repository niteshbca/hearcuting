import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/staff.controller';
import * as validators from '../validators/staff.validators';

export const router = Router();

router.get(
  '/',
  requireAuth,
  requirePermission('staff.view'),
  validate({ query: validators.staffListQuerySchema }),
  ctrl.list
);
router.post(
  '/',
  requireAuth,
  requirePermission('staff.manage'),
  validate({ body: validators.createStaffSchema }),
  ctrl.create
);

// Registered before `/:id` so these literal paths are not captured as ids.
router.get(
  '/me',
  requireAuth,
  requireRole('barber', 'manager', 'receptionist', 'accountant'),
  ctrl.me
);
router.get(
  '/leaves',
  requireAuth,
  requirePermission('staff.view'),
  validate({ query: validators.leaveListQuerySchema }),
  ctrl.listLeaves
);
router.post(
  '/leaves',
  requireAuth,
  requireRole('owner', 'manager', 'receptionist', 'barber', 'accountant'),
  validate({ body: validators.leaveCreateSchema }),
  ctrl.createLeave
);
router.patch(
  '/leaves/:id',
  requireAuth,
  requirePermission('staff.manage'),
  validate({ body: validators.leaveReviewSchema }),
  ctrl.reviewLeave
);

router.get(
  '/:id/performance',
  requireAuth,
  ctrl.performanceOrOwn,
  validate({ query: validators.staffPerformanceQuerySchema }),
  ctrl.performance
);
router.get('/:id', requireAuth, ctrl.viewOrSelf, ctrl.get);
router.patch(
  '/:id',
  requireAuth,
  ctrl.manageOrSelf,
  validate({ body: validators.updateStaffSchema }),
  ctrl.update
);
router.patch(
  '/:id/schedule',
  requireAuth,
  requirePermission('staff.manage'),
  validate({ body: validators.staffScheduleSchema }),
  ctrl.updateSchedule
);
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('staff.manage'),
  validate({ body: validators.staffStatusSchema }),
  ctrl.updateStatus
);
