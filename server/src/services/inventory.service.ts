import mongoose, { Types } from 'mongoose';
import { Request } from 'express';
import {
  InventoryTransaction,
  InventoryTransactionDoc,
  Product,
  ProductDoc,
  Supplier,
} from '../models/Inventory';
import { errors } from '../utils/errors';
import { round2 } from '../utils/money';
import { buildListResponse, parsePagination } from '../utils/pagination';
import { endOfLocalDay, startOfLocalDay } from '../utils/time';
import { createNotification } from './notification.service';

export type StockMoveType = 'in' | 'out' | 'adjustment' | 'waste';
export type StockRefType = 'purchase' | 'sale' | 'manual' | 'adjustment' | 'waste';

export interface AdjustStockInput {
  productId: string;
  type: StockMoveType;
  /** Positive amount for in/out/waste. */
  quantity?: number;
  /** Absolute target stock for adjustments. */
  newQuantity?: number;
  unitCost?: number;
  refId?: string;
  refType?: StockRefType;
  performedBy?: string;
  notes?: string;
}

function defaultRefType(type: StockMoveType): StockRefType {
  if (type === 'in') return 'purchase';
  if (type === 'waste') return 'waste';
  if (type === 'adjustment') return 'adjustment';
  return 'manual';
}

async function maybeNotifyLowStock(product: ProductDoc): Promise<void> {
  const threshold = product.lowStockThreshold ?? 0;
  if (product.stockQuantity > threshold) return;
  for (const role of ['owner', 'manager'] as const) {
    await createNotification({
      role,
      type: 'inventory.low_stock',
      title: `Low stock: ${product.name}`,
      body: `${product.name} is down to ${product.stockQuantity} (threshold ${threshold}).`,
      data: { productId: String(product._id), stockQuantity: product.stockQuantity, threshold },
    });
  }
}

/**
 * Performs an atomic stock movement and records the matching InventoryTransaction.
 * For 'out'/'waste' the update is guarded so it can never drive stock negative.
 */
export async function adjustStock(
  input: AdjustStockInput
): Promise<{ product: ProductDoc; transaction: InventoryTransactionDoc }> {
  const { productId, type } = input;
  if (!mongoose.isValidObjectId(productId)) throw errors.badRequest('Invalid product id');

  const quantity = Number(input.quantity ?? 0);
  let product: ProductDoc | null;
  let delta: number;

  if (type === 'in') {
    if (!(quantity > 0)) throw errors.badRequest('Quantity must be greater than zero');
    product = await Product.findByIdAndUpdate(
      productId,
      { $inc: { stockQuantity: quantity } },
      { new: true }
    );
    if (!product) throw errors.notFound('Product not found');
    delta = quantity;
  } else if (type === 'out' || type === 'waste') {
    if (!(quantity > 0)) throw errors.badRequest('Quantity must be greater than zero');
    product = await Product.findOneAndUpdate(
      { _id: productId, stockQuantity: { $gte: quantity } },
      { $inc: { stockQuantity: -quantity } },
      { new: true }
    );
    if (!product) {
      const exists = await Product.findById(productId).select('_id').lean();
      if (!exists) throw errors.notFound('Product not found');
      throw errors.conflict('Insufficient stock');
    }
    delta = -quantity;
  } else {
    const target = Number(input.newQuantity);
    if (!Number.isFinite(target) || target < 0) {
      throw errors.badRequest('newQuantity is required for adjustments');
    }
    product = await Product.findById(productId);
    if (!product) throw errors.notFound('Product not found');
    delta = round2(target - product.stockQuantity);
    product.stockQuantity = target;
    await product.save();
  }

  const transaction = await InventoryTransaction.create({
    product: product._id,
    type,
    quantity: delta,
    balanceAfter: product.stockQuantity,
    refType: input.refType ?? defaultRefType(type),
    refId: input.refId && mongoose.isValidObjectId(input.refId) ? new Types.ObjectId(input.refId) : undefined,
    unitCost: input.unitCost,
    notes: input.notes,
    performedBy: input.performedBy ? new Types.ObjectId(input.performedBy) : undefined,
  });

  await maybeNotifyLowStock(product);
  return { product, transaction };
}

export async function listTransactions(req: Request) {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.productId && mongoose.isValidObjectId(q.productId)) {
    filter.product = new Types.ObjectId(q.productId);
  }
  if (q.type) filter.type = q.type;
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = startOfLocalDay(q.from);
    if (q.to) range.$lt = endOfLocalDay(q.to);
    filter.createdAt = range;
  }

  const [docs, total] = await Promise.all([
    InventoryTransaction.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('product', 'name sku category')
      .populate('performedBy', 'name')
      .lean(),
    InventoryTransaction.countDocuments(filter),
  ]);
  return buildListResponse(docs, total, p);
}

export async function listSuppliers() {
  const suppliers = await Supplier.find().sort({ name: 1 }).lean();
  return { data: suppliers };
}

export async function createSupplier(input: {
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}) {
  return Supplier.create(input);
}

export async function updateSupplier(id: string, patch: Record<string, unknown>) {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid supplier id');
  const supplier = await Supplier.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
  if (!supplier) throw errors.notFound('Supplier not found');
  return supplier;
}

export async function stockReport() {
  const [valueAgg] = await Product.aggregate<{ totalValue: number; totalUnits: number }>([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalValue: { $sum: { $multiply: ['$stockQuantity', '$costPrice'] } },
        totalUnits: { $sum: '$stockQuantity' },
      },
    },
  ]);

  const lowStock = await Product.find({
    isActive: true,
    $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
  })
    .select('name sku category stockQuantity lowStockThreshold costPrice salePrice')
    .sort({ stockQuantity: 1 })
    .lean();

  const valuation = await Product.aggregate<{
    _id: Types.ObjectId;
    name: string;
    sku: string;
    stockQuantity: number;
    costPrice: number;
    value: number;
  }>([
    { $match: { isActive: true } },
    {
      $project: {
        name: 1,
        sku: 1,
        stockQuantity: 1,
        costPrice: 1,
        value: { $multiply: ['$stockQuantity', '$costPrice'] },
      },
    },
    { $sort: { value: -1 } },
  ]);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const movements = await InventoryTransaction.aggregate<{
    _id: string;
    count: number;
    quantity: number;
  }>([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$type', count: { $sum: 1 }, quantity: { $sum: '$quantity' } } },
  ]);

  return {
    totalInventoryValue: round2(valueAgg?.totalValue ?? 0),
    totalUnits: valueAgg?.totalUnits ?? 0,
    lowStockCount: lowStock.length,
    lowStock,
    valuation: valuation.map((v) => ({
      productId: String(v._id),
      name: v.name,
      sku: v.sku,
      stockQuantity: v.stockQuantity,
      costPrice: v.costPrice,
      value: round2(v.value),
    })),
    movementsLast30Days: movements,
  };
}
