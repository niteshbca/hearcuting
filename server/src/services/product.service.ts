import mongoose, { Types } from 'mongoose';
import { Request } from 'express';
import { Product, ProductDoc, Supplier } from '../models/Inventory';
import { errors } from '../utils/errors';
import { buildListResponse, parsePagination, searchRegex } from '../utils/pagination';
import { shortCode } from '../utils/reference';
import { adjustStock } from './inventory.service';

export interface ActorLike {
  userId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || `product-${Date.now()}`;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let i = 1;
  while (await Product.exists({ slug })) {
    slug = `${base}-${i++}`;
    if (i > 50) {
      slug = `${base}-${shortCode(4).toLowerCase()}`;
      break;
    }
  }
  return slug;
}

export async function listProducts(req: Request) {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.category) filter.category = q.category;
  if (q.isActive === 'true') filter.isActive = true;
  if (q.isActive === 'false') filter.isActive = false;
  if (q.lowStock === 'true') filter.$expr = { $lte: ['$stockQuantity', '$lowStockThreshold'] };
  if (q.search && q.search.trim()) {
    const regex = searchRegex(q.search);
    filter.$or = [{ name: regex }, { sku: regex }, { category: regex }];
  }

  const [docs, total] = await Promise.all([
    Product.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('suppliers', 'name phone')
      .lean(),
    Product.countDocuments(filter),
  ]);
  return buildListResponse(docs, total, p);
}

export async function lowStockProducts() {
  const docs = await Product.find({
    isActive: true,
    $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
  })
    .sort({ stockQuantity: 1 })
    .lean();
  return { data: docs };
}

export interface CreateProductInput {
  name: string;
  sku: string;
  category?: string;
  description?: string;
  costPrice: number;
  salePrice: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  isRetail?: boolean;
  imageUrls?: string[];
  suppliers?: string[];
}

export async function createProduct(input: CreateProductInput, actor?: ActorLike): Promise<ProductDoc> {
  const sku = input.sku.trim().toUpperCase();
  if (await Product.exists({ sku })) throw errors.conflict('A product with this SKU already exists');
  const slug = await uniqueSlug(input.name);

  const suppliers = (input.suppliers ?? []).filter((s) => mongoose.isValidObjectId(s));
  if (suppliers.length) {
    const found = await Supplier.countDocuments({ _id: { $in: suppliers } });
    if (found !== suppliers.length) throw errors.badRequest('One or more suppliers were not found');
  }

  const product = await Product.create({
    name: input.name,
    slug,
    sku,
    category: input.category ?? 'General',
    description: input.description ?? '',
    imageUrls: input.imageUrls ?? [],
    costPrice: input.costPrice,
    salePrice: input.salePrice,
    stockQuantity: 0,
    lowStockThreshold: input.lowStockThreshold ?? 5,
    isRetail: input.isRetail ?? true,
    isActive: true,
    suppliers: suppliers.map((s) => new Types.ObjectId(s)),
  });

  const opening = Math.max(0, Math.floor(input.stockQuantity ?? 0));
  if (opening > 0) {
    const { product: updated } = await adjustStock({
      productId: String(product._id),
      type: 'in',
      quantity: opening,
      refType: 'purchase',
      performedBy: actor?.userId,
      notes: 'Opening stock',
    });
    return updated;
  }

  return product;
}

export async function getProduct(id: string) {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid product id');
  const product = await Product.findById(id).populate('suppliers', 'name contactPerson phone email').lean();
  if (!product) throw errors.notFound('Product not found');
  return product;
}

export async function updateProduct(
  id: string,
  patch: Record<string, unknown>,
  _actor?: ActorLike
): Promise<ProductDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid product id');
  const product = await Product.findById(id);
  if (!product) throw errors.notFound('Product not found');

  if (typeof patch.name === 'string' && patch.name !== product.name) {
    product.name = patch.name;
    product.slug = await uniqueSlug(patch.name);
  }
  if (typeof patch.sku === 'string') {
    const sku = patch.sku.trim().toUpperCase();
    if (sku !== product.sku) {
      if (await Product.exists({ sku, _id: { $ne: product._id } })) {
        throw errors.conflict('A product with this SKU already exists');
      }
      product.sku = sku;
    }
  }
  if (patch.category !== undefined) product.category = String(patch.category);
  if (patch.description !== undefined) product.description = String(patch.description);
  if (patch.costPrice !== undefined) product.costPrice = Number(patch.costPrice);
  if (patch.salePrice !== undefined) product.salePrice = Number(patch.salePrice);
  if (patch.lowStockThreshold !== undefined) product.lowStockThreshold = Number(patch.lowStockThreshold);
  if (patch.isRetail !== undefined) product.isRetail = Boolean(patch.isRetail);
  if (patch.imageUrls !== undefined) product.imageUrls = patch.imageUrls as string[];
  if (patch.suppliers !== undefined) {
    product.suppliers = (patch.suppliers as string[])
      .filter((s) => mongoose.isValidObjectId(s))
      .map((s) => new Types.ObjectId(s));
  }

  await product.save();
  return product;
}

export async function setProductStatus(id: string, isActive: boolean): Promise<ProductDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid product id');
  const product = await Product.findByIdAndUpdate(id, { isActive }, { new: true });
  if (!product) throw errors.notFound('Product not found');
  return product;
}
