import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import * as inventoryService from '../services/inventory.service';

export const listSuppliers = asyncHandler(async (_req: Request, res: Response) => {
  const result = await inventoryService.listSuppliers();
  res.json(result);
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const supplier = await inventoryService.createSupplier(req.body);
  await logAudit({
    actor,
    action: 'supplier.create',
    entity: 'Supplier',
    entityId: String(supplier._id),
    after: { name: supplier.name },
  });
  res.status(201).json({ data: supplier });
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const supplier = await inventoryService.updateSupplier(req.params.id, req.body);
  await logAudit({
    actor,
    action: 'supplier.update',
    entity: 'Supplier',
    entityId: String(supplier._id),
    after: req.body,
  });
  res.json({ data: supplier });
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.listTransactions(req);
  res.json(result);
});

export const stock = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { product, transaction } = await inventoryService.adjustStock({
    ...req.body,
    performedBy: actor.userId,
  });
  await logAudit({
    actor,
    action: 'inventory.stock',
    entity: 'InventoryTransaction',
    entityId: String(transaction._id),
    after: {
      productId: String(product._id),
      type: transaction.type,
      quantity: transaction.quantity,
      balanceAfter: transaction.balanceAfter,
    },
  });
  res.status(201).json({ data: { product, transaction } });
});

export const stockReportHandler = asyncHandler(async (_req: Request, res: Response) => {
  const result = await inventoryService.stockReport();
  res.json({ data: result });
});
