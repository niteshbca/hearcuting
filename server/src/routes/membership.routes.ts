import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/membership.controller';
import {
  createPlanSchema,
  purchaseMembershipSchema,
  redeemSchema,
  renewSchema,
  updatePlanSchema,
} from '../validators/membership.validators';

export const router = Router();

router.get('/plans', requireAuth, requirePermission('memberships.manage'), ctrl.listPlans);
router.post(
  '/plans',
  requireAuth,
  requirePermission('memberships.manage'),
  validate({ body: createPlanSchema }),
  ctrl.createPlan
);
router.patch(
  '/plans/:id',
  requireAuth,
  requirePermission('memberships.manage'),
  validate({ body: updatePlanSchema }),
  ctrl.updatePlan
);

router.get('/redemptions', requireAuth, requirePermission('memberships.view'), ctrl.redemptions);
router.get('/customer/:customerId', requireAuth, ctrl.customerMemberships);

router.get('/', requireAuth, requirePermission('memberships.view'), ctrl.list);
router.post(
  '/',
  requireAuth,
  requirePermission('memberships.manage'),
  validate({ body: purchaseMembershipSchema }),
  ctrl.purchase
);
router.post(
  '/renew/:id',
  requireAuth,
  requirePermission('memberships.manage'),
  validate({ body: renewSchema }),
  ctrl.renew
);
router.post(
  '/:id/redeem',
  requireAuth,
  requirePermission('memberships.redeem'),
  validate({ body: redeemSchema }),
  ctrl.redeem
);
