import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(60),
  category: z.string().trim().max(80).optional(),
  description: z.string().max(2000).optional(),
  costPrice: z.number().min(0),
  salePrice: z.number().min(0),
  stockQuantity: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  isRetail: z.boolean().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  suppliers: z.array(objectId).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sku: z.string().trim().min(2).max(60).optional(),
  category: z.string().trim().max(80).optional(),
  description: z.string().max(2000).optional(),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  isRetail: z.boolean().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  suppliers: z.array(objectId).optional(),
});

export const productStatusSchema = z.object({
  isActive: z.boolean(),
});
