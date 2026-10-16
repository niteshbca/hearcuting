import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { errors } from '../utils/errors';
import * as reportService from '../services/report.service';
import { ExportName } from '../services/report.service';

const EXPORT_NAMES: ExportName[] = [
  'sales',
  'services',
  'staff',
  'bookings',
  'customers',
  'expenses',
  'outstanding',
  'inventory',
];

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportService.dashboard(req);
  res.json({ data });
});

export const sales = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.salesReport(req);
  res.json(result);
});

export const services = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.servicesReport(req);
  res.json(result);
});

export const staff = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.staffReport(req);
  res.json(result);
});

export const bookings = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.bookingsReport(req);
  res.json(result);
});

export const customers = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.customersReport(req);
  res.json(result);
});

export const inventory = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.inventoryReport(req);
  res.json(result);
});

export const expenses = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.expensesReport(req);
  res.json(result);
});

export const outstanding = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.outstandingReport(req);
  res.json(result);
});

export const profit = asyncHandler(async (req: Request, res: Response) => {
  const result = await reportService.profitReport(req);
  res.json(result);
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const name = req.params.name as ExportName;
  if (!EXPORT_NAMES.includes(name)) throw errors.notFound('Unknown report export');
  const { filename, csv } = await reportService.exportCsv(name, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});
