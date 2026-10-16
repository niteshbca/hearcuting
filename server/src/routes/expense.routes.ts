import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/expense.controller';
import { createExpenseSchema, updateExpenseSchema } from '../validators/expense.validators';

export const router = Router();

router.get(
  '/',
  requireAuth,
  requireAnyPermission('expenses.view', 'expenses.manage'),
  ctrl.list
);
router.post(
  '/',
  requireAuth,
  requirePermission('expenses.manage'),
  validate({ body: createExpenseSchema }),
  ctrl.create
);
router.patch(
  '/:id',
  requireAuth,
  requirePermission('expenses.manage'),
  validate({ body: updateExpenseSchema }),
  ctrl.update
);
router.delete('/:id', requireAuth, requirePermission('expenses.manage'), ctrl.remove);
