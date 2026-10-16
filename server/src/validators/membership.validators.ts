import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

const includeSchema = z
  .object({
    service: objectId.optional(),
    serviceName: z.string().trim().max(120).optional(),
    limitTotal: z.number().int().min(1),
    discountPercent: z.number().min(0).max(100).optional(),
  })
  .refine((v) => Boolean(v.service || v.serviceName), {
    message: 'Each include needs a service or serviceName',
  });

export const createPlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(['membership', 'package']).optional(),
  description: z.string().max(2000).optional(),
  price: z.number().min(0),
  validityDays: z.number().int().min(1).max(3650),
  includes: z.array(includeSchema).optional(),
  credits: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  sortWeight: z.number().optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: z.enum(['membership', 'package']).optional(),
  description: z.string().max(2000).optional(),
  price: z.number().min(0).optional(),
  validityDays: z.number().int().min(1).max(3650).optional(),
  includes: z.array(includeSchema).optional(),
  credits: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  sortWeight: z.number().optional(),
});

export const purchaseMembershipSchema = z.object({
  customerId: objectId,
  planId: objectId,
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'online', 'voucher', 'membership']).optional(),
  startDate: z.string().min(4).max(40).optional(),
});

export const redeemSchema = z
  .object({
    serviceId: objectId.optional(),
    serviceName: z.string().trim().max(120).optional(),
    appointmentId: objectId.optional(),
    invoiceId: objectId.optional(),
    applyDiscount: z.boolean().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((v) => Boolean(v.serviceId || v.serviceName), {
    message: 'serviceId or serviceName is required',
  });

export const renewSchema = z.object({
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'online', 'voucher', 'membership']).optional(),
});
