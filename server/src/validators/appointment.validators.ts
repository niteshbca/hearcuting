import { z } from 'zod';
import mongoose from 'mongoose';
import { isValidDateKey, isValidTime } from '../utils/time';

export const APPOINTMENT_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

export const PAYMENT_STATUSES = ['unpaid', 'deposit_paid', 'paid', 'refunded', 'partially_paid'] as const;

export const BOOKING_SOURCES = ['website', 'phone', 'walk_in', 'admin'] as const;

const dateKey = z
  .string()
  .trim()
  .refine(isValidDateKey, 'must be a valid YYYY-MM-DD date');

const timeHHMM = z
  .string()
  .trim()
  .refine(isValidTime, 'must be a valid HH:mm time');

const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(20)
  .regex(/^[+]?[\d\s()-]+$/, 'Enter a valid phone number');

const objectId = z
  .string()
  .trim()
  .refine((v) => mongoose.isValidObjectId(v), 'must be a valid id');

export const idParamsSchema = z.object({
  id: objectId,
});

export const createBookingBodySchema = z.object({
  serviceId: objectId,
  staffId: z.string().trim().optional(),
  date: dateKey,
  time: timeHHMM,
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: phoneSchema,
  notes: z.string().trim().max(2000).optional(),
  guest: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  staffId: objectId.optional(),
  customerId: objectId.optional(),
  from: dateKey.optional(),
  to: dateKey.optional(),
  source: z.enum(BOOKING_SOURCES).optional(),
  sort: z.string().trim().max(100).optional(),
});

export const manageQuerySchema = z.object({
  token: z.string().trim().min(8).max(256).optional(),
});

export const rescheduleBodySchema = z.object({
  token: z.string().trim().min(8).max(256).optional(),
  date: dateKey,
  time: timeHHMM,
  staffId: z.string().trim().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const cancelBodySchema = z.object({
  token: z.string().trim().min(8).max(256).optional(),
  reason: z.string().trim().max(500).optional(),
});

const customerContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: phoneSchema,
});

export const walkInBodySchema = z
  .object({
    customerId: objectId.optional(),
    customer: customerContactSchema.optional(),
    serviceId: objectId,
    staffId: objectId,
    date: dateKey,
    time: timeHHMM,
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((b) => b.customerId || b.customer, {
    message: 'Provide either customerId or customer details { name, email, phone }',
  });

export const statusBodySchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  serviceNotes: z.string().trim().max(4000).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const assignBodySchema = z.object({
  staffId: objectId,
  reason: z.string().trim().max(500).optional(),
});

export const patchBodySchema = z
  .object({
    date: dateKey.optional(),
    time: timeHHMM.optional(),
    staffId: z.string().trim().optional(),
    notes: z.string().trim().max(2000).optional(),
    internalNotes: z.string().trim().max(4000).optional(),
    serviceNotes: z.string().trim().max(4000).optional(),
  })
  .refine(
    (b) =>
      b.date !== undefined ||
      b.time !== undefined ||
      b.staffId !== undefined ||
      b.notes !== undefined ||
      b.internalNotes !== undefined ||
      b.serviceNotes !== undefined,
    { message: 'Provide at least one field to update' }
  );

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type WalkInBody = z.infer<typeof walkInBodySchema>;
export type RescheduleBody = z.infer<typeof rescheduleBodySchema>;
export type CancelBody = z.infer<typeof cancelBodySchema>;
export type StatusBody = z.infer<typeof statusBodySchema>;
export type AssignBody = z.infer<typeof assignBodySchema>;
export type PatchBody = z.infer<typeof patchBodySchema>;
