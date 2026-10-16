import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/report.controller';

export const router = Router();

router.get('/dashboard', requireAuth, ctrl.dashboard);
router.get('/sales', requireAuth, requirePermission('reports.view'), ctrl.sales);
router.get('/services', requireAuth, requirePermission('reports.view'), ctrl.services);
router.get('/staff', requireAuth, requirePermission('reports.view'), ctrl.staff);
router.get('/bookings', requireAuth, requirePermission('reports.view'), ctrl.bookings);
router.get('/customers', requireAuth, requirePermission('customers.view'), ctrl.customers);
router.get('/inventory', requireAuth, requirePermission('inventory.view'), ctrl.inventory);
router.get('/expenses', requireAuth, requirePermission('expenses.view'), ctrl.expenses);
router.get('/outstanding', requireAuth, requirePermission('reports.financial'), ctrl.outstanding);
router.get('/profit', requireAuth, requirePermission('reports.financial'), ctrl.profit);

// Declared after the specific report routes above.
router.get('/:name/export', requireAuth, requirePermission('reports.view'), ctrl.exportReport);
