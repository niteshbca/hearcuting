import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import * as productService from '../services/product.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await productService.listProducts(req);
  res.json(result);
});

export const lowStock = asyncHandler(async (_req: Request, res: Response) => {
  const result = await productService.lowStockProducts();
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const product = await productService.createProduct(req.body, actor);
  await logAudit({
    actor,
    action: 'product.create',
    entity: 'Product',
    entityId: String(product._id),
    after: { name: product.name, sku: product.sku, stockQuantity: product.stockQuantity },
  });
  res.status(201).json({ data: product });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProduct(req.params.id);
  res.json({ data: product });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const product = await productService.updateProduct(req.params.id, req.body, actor);
  await logAudit({
    actor,
    action: 'product.update',
    entity: 'Product',
    entityId: String(product._id),
    after: req.body,
  });
  res.json({ data: product });
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const product = await productService.setProductStatus(req.params.id, req.body.isActive);
  await logAudit({
    actor,
    action: 'product.status',
    entity: 'Product',
    entityId: String(product._id),
    after: { isActive: product.isActive },
  });
  res.json({ data: product });
});
