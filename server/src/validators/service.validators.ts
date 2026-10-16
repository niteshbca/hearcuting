import { z } from 'zod';
import { SERVICE_CATEGORIES } from '../models/Service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

export const serviceListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().max(120).optional(),
  includeInactive: boolish.optional(),
  search: z.string().trim().max(120).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
});

const bookingRulesSchema = z.object({
  minNoticeHours: z.number().min(0).max(720).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  allowGuest: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  onlinePaymentAllowed: z.boolean().optional(),
});

export const createServiceSchema = z
  .object({
    name: z.string().trim().min(2, 'Service name is too short').max(120),
    category: z.enum(SERVICE_CATEGORIES),
    description: z.string().trim().max(4000).optional(),
    price: z.number().min(0, 'Price must be zero or more'),
    discountPrice: z.number().min(0, 'Discount price must be zero or more').nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
    imageUrls: z.array(z.string().max(500)).max(10).optional(),
    staff: z.array(objectId).max(50).optional(),
    bookingRules: bookingRulesSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountPrice != null && value.discountPrice >= value.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountPrice'],
        message: 'Discount price must be less than the regular price',
      });
    }
  });

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    category: z.enum(SERVICE_CATEGORIES).optional(),
    description: z.string().trim().max(4000).optional(),
    price: z.number().min(0).optional(),
    discountPrice: z.number().min(0).nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
    imageUrls: z.array(z.string().max(500)).max(10).optional(),
    staff: z.array(objectId).max(50).optional(),
    bookingRules: bookingRulesSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    updateSlug: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountPrice != null && value.price != null && value.discountPrice >= value.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountPrice'],
        message: 'Discount price must be less than the regular price',
      });
    }
  });

export const serviceStatusSchema = z.object({
  isActive: z.boolean(),
});
