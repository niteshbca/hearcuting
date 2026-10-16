import { z } from 'zod';
import { isValidDateKey } from '../utils/time';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isValidDateKey, 'Invalid date');

const paginationFields = {
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().max(120).optional(),
};

export const customerListQuerySchema = z.object({
  ...paginationFields,
  search: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
  staffId: objectId.optional(),
  from: dateKey.optional(),
  to: dateKey.optional(),
});

export const customerPageQuerySchema = z.object({
  ...paginationFields,
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .trim()
    .min(7, 'Enter a valid phone number')
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, 'Enter a valid phone number'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  birthday: dateKey.optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  notes: z.string().trim().max(5000).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z
    .string()
    .trim()
    .min(7, 'Enter a valid phone number')
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, 'Enter a valid phone number')
    .optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  birthday: dateKey.optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  notes: z.string().trim().max(5000).optional(),
  marketingOptIn: z.boolean().optional(),
  preferredStaff: objectId.optional(),
});

export const customerNotesSchema = z.object({
  notes: z.string().trim().max(8000),
  append: z.boolean().optional(),
});
