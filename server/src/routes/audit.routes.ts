import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/audit.controller';

export const router = Router();

router.get('/', requireAuth, requirePermission('audit.view'), ctrl.list);
