import { z } from 'zod';

export const createExpenseSchema = z.object({
  category: z.enum(['rent', 'electricity', 'salaries', 'supplies', 'maintenance', 'marketing', 'other']),
  title: z.string().trim().min(2).max(160),
  amount: z.number().positive(),
  date: z.string().min(4).max(40),
  vendor: z.string().trim().max(160).optional(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'bank', 'other']).optional(),
  notes: z.string().max(1000).optional(),
  attachmentUrl: z.string().max(500).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();
