import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import * as settingsService from '../services/settings.service';
import { logAudit } from '../services/audit.service';
import { env } from '../config/env';
import { smtpConfigured } from '../config/env';

export const getFull = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await settingsService.getSettings();
  res.json({
    data: settings,
    integrations: {
      smtpConfigured: smtpConfigured(),
      razorpayConfigured: Boolean(env().RAZORPAY_KEY_ID && env().RAZORPAY_KEY_SECRET),
      cloudinaryConfigured: Boolean(env().CLOUDINARY_CLOUD_NAME && env().CLOUDINARY_UPLOAD_PRESET),
      uploadProvider: env().CLOUDINARY_CLOUD_NAME && env().CLOUDINARY_UPLOAD_PRESET ? 'cloudinary' : 'local',
    },
  });
});

export const getPublic = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await settingsService.getSettings();
  res.json({ data: settingsService.toPublicSettings(settings) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const before = await settingsService.getSettings();
  const settings = await settingsService.updateSettings(req.body, actor.userId);
  await logAudit({
    actor,
    action: 'settings.update',
    entity: 'SalonSettings',
    entityId: String(settings._id),
    before: before.toObject(),
    after: req.body,
  });
  res.json({ data: settings });
});

export const getBusinessHours = asyncHandler(async (_req: Request, res: Response) => {
  const hours = await settingsService.getBusinessHours();
  res.json({ data: hours });
});

export const setBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  await settingsService.setBusinessHours(req.body.days);
  await logAudit({ actor, action: 'settings.business_hours', entity: 'BusinessHours', after: req.body.days });
  const hours = await settingsService.getBusinessHours();
  res.json({ data: hours });
});

export const uploadConfig = asyncHandler(async (_req: Request, res: Response) => {
  const e = env();
  const cloudinary = Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_UPLOAD_PRESET);
  res.json({
    data: cloudinary
      ? {
          provider: 'cloudinary',
          cloudName: e.CLOUDINARY_CLOUD_NAME,
          uploadPreset: e.CLOUDINARY_UPLOAD_PRESET,
          maxSizeMb: e.MAX_UPLOAD_MB,
        }
      : { provider: 'local', maxSizeMb: e.MAX_UPLOAD_MB, uploadUrl: '/api/uploads' },
  });
});
