import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { errors } from '../utils/errors';
import { logAudit } from '../services/audit.service';
import { getSettings, toPublicSettings } from '../services/settings.service';
import * as invoiceService from '../services/invoice.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await invoiceService.listInvoices(req);
  res.json(result);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const result = await invoiceService.getInvoiceForUser(req.params.id, req.user);
  res.json({ data: result });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const result = await invoiceService.createInvoiceFromPayload(req.body, actor);
  await logAudit({
    actor,
    action: 'invoice.create',
    entity: 'Invoice',
    entityId: result.invoice ? String(result.invoice._id) : undefined,
    after: {
      invoiceNumber: result.invoice?.invoiceNumber,
      total: result.invoice?.total,
      itemCount: result.invoice?.items?.length,
    },
  });
  res.status(201).json({ data: result });
});

export const refund = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const result = await invoiceService.refundInvoice(req.params.id, req.body, actor);
  await logAudit({
    actor,
    action: 'invoice.refund',
    entity: 'Invoice',
    entityId: req.params.id,
    after: {
      paymentId: result.payment ? String(result.payment._id) : undefined,
      refundedAmount: result.payment?.refundedAmount,
      status: result.invoice?.status,
    },
  });
  res.json({ data: result });
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const invoice = await invoiceService.setInvoiceStatus(req.params.id, req.body.status);
  await logAudit({
    actor,
    action: 'invoice.status',
    entity: 'Invoice',
    entityId: String(invoice._id),
    after: { status: invoice.status },
  });
  res.json({ data: invoice });
});

export const print = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const actor = actorFrom(req);
  const { invoice, payments } = await invoiceService.getInvoiceForUser(req.params.id, req.user);
  const settings = await getSettings();

  await logAudit({
    actor,
    action: 'invoice.print',
    entity: 'Invoice',
    entityId: req.params.id,
  });

  res.json({
    data: {
      salon: toPublicSettings(settings),
      invoice,
      customer: invoice?.customer ?? null,
      payments,
      qrText: `Invoice ${invoice?.invoiceNumber ?? ''} · ${invoice?.total ?? 0}`,
    },
  });
});
