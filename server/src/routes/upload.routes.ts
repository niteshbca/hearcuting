import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { maybe, uploadLimiter } from '../middleware/rateLimit';
import { uploadImage } from '../middleware/upload';
import * as ctrl from '../controllers/upload.controller';

export const router = Router();

router.post('/', requireAuth, maybe(uploadLimiter), uploadImage.single('file'), ctrl.uploadSingle);
