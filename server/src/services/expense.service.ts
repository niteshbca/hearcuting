import mongoose from 'mongoose';
import { Request } from 'express';
import { Expense, ExpenseCategory, ExpenseDoc, EXPENSE_CATEGORIES } from '../models/Salon';
import { errors } from '../utils/errors';
import { round2 } from '../utils/money';
import { buildListResponse, parsePagination, searchRegex } from '../utils/pagination';
import { endOfLocalDay, startOfLocalDay } from '../utils/time';

export interface ActorLike {
  userId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}

export interface ExpenseInput {
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string;
  vendor?: string;
  paymentMethod?: 'cash' | 'upi' | 'card' | 'bank' | 'other';
  notes?: string;
  attachmentUrl?: string;
}

export function parseExpenseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfLocalDay(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw errors.badRequest('Invalid date');
  return d;
}

export async function listExpenses(req: Request) {
  const p = parsePagination(req, '-date');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};

  if (q.category) filter.category = q.category;
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = startOfLocalDay(q.from);
    if (q.to) range.$lt = endOfLocalDay(q.to);
    filter.date = range;
  }
  if (q.search && q.search.trim()) {
    const regex = searchRegex(q.search);
    filter.$or = [{ title: regex }, { vendor: regex }, { notes: regex }];
  }

  const [docs, total, byCategory] = await Promise.all([
    Expense.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('recordedBy', 'name')
      .lean(),
    Expense.countDocuments(filter),
    Expense.aggregate<{ _id: string; total: number; count: number }>([
      { $match: filter },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  const response = buildListResponse(docs, total, p);
  const summary = {
    totalAmount: round2(byCategory.reduce((sum, c) => sum + c.total, 0)),
    count: total,
    byCategory: byCategory.map((c) => ({ category: c._id, total: round2(c.total), count: c.count })),
  };
  return { ...response, meta: { ...response.meta, summary } };
}

export async function createExpense(input: ExpenseInput, actor?: ActorLike): Promise<ExpenseDoc> {
  return Expense.create({
    category: input.category,
    title: input.title,
    amount: input.amount,
    date: parseExpenseDate(input.date),
    vendor: input.vendor,
    paymentMethod: input.paymentMethod ?? 'cash',
    notes: input.notes,
    attachmentUrl: input.attachmentUrl,
    recordedBy: actor?.userId ? new mongoose.Types.ObjectId(actor.userId) : undefined,
  });
}

export async function updateExpense(
  id: string,
  patch: Partial<ExpenseInput>,
  _actor?: ActorLike
): Promise<ExpenseDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid expense id');
  const expense = await Expense.findById(id);
  if (!expense) throw errors.notFound('Expense not found');

  if (patch.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(patch.category)) throw errors.badRequest('Invalid category');
    expense.category = patch.category;
  }
  if (patch.title !== undefined) expense.title = patch.title;
  if (patch.amount !== undefined) expense.amount = patch.amount;
  if (patch.date !== undefined) expense.date = parseExpenseDate(patch.date);
  if (patch.vendor !== undefined) expense.vendor = patch.vendor;
  if (patch.paymentMethod !== undefined) expense.paymentMethod = patch.paymentMethod;
  if (patch.notes !== undefined) expense.notes = patch.notes;
  if (patch.attachmentUrl !== undefined) expense.attachmentUrl = patch.attachmentUrl;

  await expense.save();
  return expense;
}

export async function deleteExpense(id: string): Promise<ExpenseDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid expense id');
  const expense = await Expense.findByIdAndDelete(id);
  if (!expense) throw errors.notFound('Expense not found');
  return expense;
}
