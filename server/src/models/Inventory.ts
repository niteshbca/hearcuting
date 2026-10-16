import { Schema, model, Types, Document } from 'mongoose';

export interface ProductDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  sku: string;
  category: string;
  description: string;
  imageUrls: string[];
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isRetail: boolean;
  isActive: boolean;
  suppliers: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: { type: String, default: 'General', index: true },
    description: { type: String, default: '' },
    imageUrls: { type: [String], default: [] },
    costPrice: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, default: 0, min: 0 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    isRetail: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true },
    suppliers: { type: [Schema.Types.ObjectId], ref: 'Supplier', default: [] },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', sku: 'text', category: 'text' });

export const Product = model<ProductDoc>('Product', productSchema);

export interface SupplierDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<SupplierDoc>(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: String,
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: String,
    notes: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Supplier = model<SupplierDoc>('Supplier', supplierSchema);

export interface InventoryTransactionDoc extends Document {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'waste';
  quantity: number;
  balanceAfter: number;
  refType?: 'purchase' | 'sale' | 'manual' | 'adjustment' | 'waste';
  refId?: Types.ObjectId;
  unitCost?: number;
  notes?: string;
  performedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const inventoryTransactionSchema = new Schema<InventoryTransactionDoc>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: { type: String, enum: ['in', 'out', 'adjustment', 'sale', 'waste'], required: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    refType: { type: String, enum: ['purchase', 'sale', 'manual', 'adjustment', 'waste'] },
    refId: { type: Schema.Types.ObjectId },
    unitCost: { type: Number, min: 0 },
    notes: String,
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ product: 1, createdAt: -1 });
inventoryTransactionSchema.index({ createdAt: -1 });

export const InventoryTransaction = model<InventoryTransactionDoc>(
  'InventoryTransaction',
  inventoryTransactionSchema
);
