import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().toLowerCase().email().optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const stockSchema = z
  .object({
    productId: objectId,
    type: z.enum(['in', 'out', 'adjustment', 'waste']),
    quantity: z.number().positive().optional(),
    newQuantity: z.number().min(0).optional(),
    unitCost: z.number().min(0).optional(),
    refType: z.enum(['purchase', 'sale', 'manual', 'adjustment', 'waste']).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'adjustment') {
      if (val.newQuantity === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newQuantity'],
          message: 'newQuantity is required for adjustments',
        });
      }
    } else if (val.quantity === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'quantity is required',
      });
    }
  });
