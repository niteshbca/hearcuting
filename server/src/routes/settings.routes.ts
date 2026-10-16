import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/settings.controller';

export const router = Router();

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const bookingSchema = z.object({
  autoConfirm: z.boolean().optional(),
  allowGuest: z.boolean().optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  minNoticeHours: z.number().min(0).max(168).optional(),
  slotIntervalMinutes: z.number().int().min(5).max(120).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  requireDeposit: z.boolean().optional(),
  depositPercent: z.number().min(1).max(100).optional(),
  rescheduleCutoffHours: z.number().min(0).max(168).optional(),
  cancelCutoffHours: z.number().min(0).max(168).optional(),
  cancellationPolicyText: z.string().max(4000).optional(),
  noShowFeePercent: z.number().min(0).max(100).optional(),
});

const updateSchema = z.object({
  salonName: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().max(200).optional(),
  logoUrl: z.string().max(500).optional(),
  address: z
    .object({
      line1: z.string().max(200).default(''),
      line2: z.string().max(200).optional(),
      city: z.string().max(100).default(''),
      state: z.string().max(100).optional(),
      postalCode: z.string().max(20).optional(),
      country: z.string().max(100).default('India'),
      geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
    })
    .optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal('')),
  social: z
    .object({
      instagram: z.string().max(300).optional(),
      facebook: z.string().max(300).optional(),
      youtube: z.string().max(300).optional(),
    })
    .optional(),
  currency: z.object({ code: z.string().max(8), symbol: z.string().max(4) }).optional(),
  timezone: z.string().max(64).optional(),
  aboutText: z.string().max(8000).optional(),
  heroImages: z.array(z.string().max(500)).max(12).optional(),
  galleryImages: z
    .array(
      z.object({
        url: z.string().max(500),
        caption: z.string().max(200).optional(),
        category: z.string().max(60).optional(),
      })
    )
    .max(200)
    .optional(),
  booking: bookingSchema.optional(),
  notifications: z
    .object({
      emailEnabled: z.boolean().optional(),
      remindersEnabled: z.boolean().optional(),
      remindersHoursBefore: z.number().min(1).max(168).optional(),
    })
    .optional(),
  payments: z
    .object({ onlinePaymentsEnabled: z.boolean().optional(), showPrices: z.boolean().optional() })
    .optional(),
  privacyPolicyText: z.string().max(20000).optional(),
  termsText: z.string().max(20000).optional(),
});

const businessHoursSchema = z.object({
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        isOpen: z.boolean(),
        openTime: z.string().regex(timeRe),
        closeTime: z.string().regex(timeRe),
      })
    )
    .min(1)
    .max(7),
});

router.get('/public', ctrl.getPublic);
router.get('/upload-config', requireAuth, ctrl.uploadConfig);
router.get('/business-hours', ctrl.getBusinessHours);
router.put(
  '/business-hours',
  requireAuth,
  requirePermission('settings.manage'),
  validate({ body: businessHoursSchema }),
  ctrl.setBusinessHours
);
router.get('/', requireAuth, ctrl.getFull);
router.patch('/', requireAuth, requirePermission('settings.manage'), validate({ body: updateSchema }), ctrl.update);
