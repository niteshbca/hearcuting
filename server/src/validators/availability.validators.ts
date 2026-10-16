import { z } from 'zod';
import { isValidDateKey } from '../utils/time';

const dateKey = z
  .string()
  .trim()
  .refine(isValidDateKey, 'date must be a valid YYYY-MM-DD date');

export const slotsQuerySchema = z.object({
  serviceId: z.string().trim().min(1, 'serviceId is required'),
  date: dateKey,
  staffId: z.string().trim().optional(),
});

export const calendarQuerySchema = z.object({
  from: dateKey,
  to: dateKey,
  staffId: z.string().trim().optional(),
});

export const staffDayQuerySchema = z.object({
  date: dateKey,
  staffId: z.string().trim().optional(),
});

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type StaffDayQuery = z.infer<typeof staffDayQuerySchema>;
