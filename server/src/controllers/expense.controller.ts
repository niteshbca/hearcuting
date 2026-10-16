import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import * as expenseService from '../services/expense.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await expenseService.listExpenses(req);
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const expense = await expenseService.createExpense(req.body, actor);
  await logAudit({
    actor,
    action: 'expense.create',
    entity: 'Expense',
    entityId: String(expense._id),
    after: { category: expense.category, title: expense.title, amount: expense.amount },
  });
  res.status(201).json({ data: expense });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const expense = await expenseService.updateExpense(req.params.id, req.body, actor);
  await logAudit({
    actor,
    action: 'expense.update',
    entity: 'Expense',
    entityId: String(expense._id),
    after: req.body,
  });
  res.json({ data: expense });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const expense = await expenseService.deleteExpense(req.params.id);
  await logAudit({
    actor,
    action: 'expense.delete',
    entity: 'Expense',
    entityId: String(expense._id),
    before: { category: expense.category, title: expense.title, amount: expense.amount },
  });
  res.json({ data: { id: String(expense._id) } });
});
