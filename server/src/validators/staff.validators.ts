import { z } from 'zod';
import { isValidDateKey } from '../utils/time';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(isValidDateKey, 'Invalid date');

export const STAFF_ROLES = ['barber', 'manager', 'receptionist', 'accountant'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'] as const;
export const LEAVE_TYPES = ['paid', 'unpaid', 'sick', 'other'] as const;

const breakSchema = z.object({
  start: z.string().regex(timeRe, 'Use HH:mm'),
  end: z.string().regex(timeRe, 'Use HH:mm'),
});

export const weeklyDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    isWorking: z.boolean().default(true),
    start: z.string().regex(timeRe, 'Use HH:mm'),
    end: z.string().regex(timeRe, 'Use HH:mm'),
    breaks: z.array(breakSchema).default([]),
  })
  .superRefine((day, ctx) => {
    if (!day.isWorking) return;
    if (day.start >= day.end) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'Shift end must be after start' });
    }
    day.breaks.forEach((b, i) => {
      if (b.start >= b.end) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['breaks', i, 'end'], message: 'Break end must be after start' });
      }
      if (b.start < day.start || b.end > day.end) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['breaks', i], message: 'Break must fall inside the shift' });
      }
    });
  });

export const weeklyScheduleSchema = z
  .array(weeklyDaySchema)
  .length(7, 'Weekly schedule must contain all 7 days')
  .superRefine((days, ctx) => {
    const seen = new Set(days.map((d) => d.day));
    if (seen.size !== 7) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Weekly schedule must cover days 0 to 6 exactly once' });
    }
  });

export const staffListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  isActive: boolish.optional(),
});

const staffMutableFields = {
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .min(7, 'Enter a valid phone number')
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, 'Enter a valid phone number'),
  specialties: z.array(z.string().trim().min(1).max(60)).max(30),
  services: z.array(objectId).max(100),
  weeklySchedule: weeklyScheduleSchema,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  salary: z.number().min(0),
  commissionPercent: z.number().min(0).max(100),
  photoUrl: z.string().max(500),
};

export const createStaffSchema = z.object({
  name: staffMutableFields.name,
  email: z.string().trim().toLowerCase().email(),
  phone: staffMutableFields.phone,
  role: z.enum(STAFF_ROLES),
  specialties: staffMutableFields.specialties.optional(),
  services: staffMutableFields.services.optional(),
  weeklySchedule: staffMutableFields.weeklySchedule.optional(),
  employmentType: staffMutableFields.employmentType.optional(),
  salary: staffMutableFields.salary.optional(),
  commissionPercent: staffMutableFields.commissionPercent.optional(),
  photoUrl: staffMutableFields.photoUrl.optional(),
});

export const updateStaffSchema = z.object({
  name: staffMutableFields.name.optional(),
  phone: staffMutableFields.phone.optional(),
  specialties: staffMutableFields.specialties.optional(),
  services: staffMutableFields.services.optional(),
  weeklySchedule: staffMutableFields.weeklySchedule.optional(),
  employmentType: staffMutableFields.employmentType.optional(),
  salary: staffMutableFields.salary.optional(),
  commissionPercent: staffMutableFields.commissionPercent.optional(),
  photoUrl: staffMutableFields.photoUrl.optional(),
  isActive: z.boolean().optional(),
});

export const staffScheduleSchema = z.object({
  weeklySchedule: weeklyScheduleSchema,
});

export const staffStatusSchema = z.object({
  isActive: z.boolean(),
});

export const staffPerformanceQuerySchema = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
});

export const leaveCreateSchema = z
  .object({
    startDate: dateKey,
    endDate: dateKey,
    type: z.enum(LEAVE_TYPES),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' });
    }
  });

export const leaveListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().max(120).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  staffId: objectId.optional(),
  from: dateKey.optional(),
  to: dateKey.optional(),
});

export const leaveReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(500).optional(),
});
