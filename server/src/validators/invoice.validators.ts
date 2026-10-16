import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

const itemSchema = z.object({
  type: z.enum(['service', 'product']),
  refId: objectId.optional(),
  name: z.string().trim().max(160).optional(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().min(0).optional(),
  staff: objectId.optional(),
});

export const createInvoiceSchema = z.object({
  appointmentId: objectId.optional(),
  customerId: objectId.optional(),
  customer: z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().optional(),
      phone: z.string().trim().min(7).max(20),
    })
    .optional(),
  items: z.array(itemSchema).min(1),
  discount: z
    .object({
      type: z.enum(['percent', 'fixed']),
      value: z.number().min(0),
    })
    .optional(),
  taxRate: z.number().min(0).max(100).optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'upi', 'card', 'online', 'voucher', 'membership']),
        amount: z.number().positive(),
        reference: z.string().max(120).optional(),
      })
    )
    .optional(),
  notes: z.string().max(1000).optional(),
  redeemMembershipId: objectId.optional(),
  reissue: z.boolean().optional(),
});

export const refundInvoiceSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
  paymentId: objectId.optional(),
});

export const invoiceStatusSchema = z.object({
  status: z.enum(['void', 'draft', 'unpaid']),
});
