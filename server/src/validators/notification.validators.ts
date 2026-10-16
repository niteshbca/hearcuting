import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

export const notificationListQuery = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    unreadOnly: z.enum(['true', 'false']).optional(),
  })
  .passthrough();

export const emailLogListQuery = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(['queued', 'sending', 'sent', 'failed', 'retrying']).optional(),
    to: z.string().trim().max(160).optional(),
    search: z.string().trim().max(160).optional(),
  })
  .passthrough();

export const notificationIdParams = z.object({ id: objectId });
