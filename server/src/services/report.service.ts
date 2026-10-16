import mongoose, { Types } from 'mongoose';
import { Request } from 'express';
import { env } from '../config/env';
import { Payment } from '../models/Payment';
import { Invoice } from '../models/Invoice';
import { Appointment, BUSY_STATUSES } from '../models/Appointment';
import { CustomerProfile } from '../models/CustomerProfile';
import { Product, InventoryTransaction } from '../models/Inventory';
import { Expense } from '../models/Salon';
import { StaffProfile } from '../models/StaffProfile';
import { StaffLeave } from '../models/Schedule';
import { Service } from '../models/Service';
import { addMoney, percentOf, round2, subtractMoney } from '../utils/money';
import {
  addDays,
  endOfLocalDay,
  isValidDateKey,
  localDateKey,
  localWeekday,
  monthRange,
  startOfLocalDay,
  todayRange,
} from '../utils/time';
import { buildListResponse, Pagination, parsePagination } from '../utils/pagination';

const CAPTURED = ['captured', 'partially_refunded'] as const;

function tz(): string {
  return env().TIMEZONE;
}

export interface RangeResult {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
}

export function rangeFromQuery(
  q: { from?: string; to?: string },
  opts: { defaultDays?: number; defaultThisMonth?: boolean } = {}
): RangeResult {
  const today = localDateKey();
  let toKey: string;
  let fromKey: string;
  if (q.from || q.to) {
    toKey = q.to && isValidDateKey(q.to) ? q.to : today;
    fromKey = q.from && isValidDateKey(q.from) ? q.from : addDays(toKey, -(opts.defaultDays ?? 29));
  } else if (opts.defaultThisMonth) {
    toKey = today;
    fromKey = `${today.slice(0, 7)}-01`;
  } else {
    toKey = today;
    fromKey = addDays(today, -(opts.defaultDays ?? 29));
  }
  return { from: startOfLocalDay(fromKey), to: endOfLocalDay(toKey), fromKey, toKey };
}

export async function sumPayments(from: Date, to: Date) {
  const [agg] = await Payment.aggregate<{ gross: number; refunds: number; count: number }>([
    { $match: { status: { $in: [...CAPTURED] }, paidAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        gross: { $sum: '$amount' },
        refunds: { $sum: '$refundedAmount' },
        count: { $sum: 1 },
      },
    },
  ]);
  const gross = round2(agg?.gross ?? 0);
  const refunds = round2(agg?.refunds ?? 0);
  return { gross, refunds, net: subtractMoney(gross, refunds), count: agg?.count ?? 0 };
}

export async function productCostInRange(from: Date, to: Date): Promise<number> {
  const rows = await Invoice.aggregate<{ _id: Types.ObjectId; quantity: number }>([
    { $match: { issuedAt: { $gte: from, $lt: to }, status: { $ne: 'void' } } },
    { $unwind: '$items' },
    { $match: { 'items.type': 'product', 'items.refId': { $ne: null } } },
    { $group: { _id: '$items.refId', quantity: { $sum: '$items.quantity' } } },
  ]);
  if (!rows.length) return 0;
  const products = await Product.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('costPrice')
    .lean();
  const costMap = new Map(products.map((p) => [String(p._id), p.costPrice]));
  let cost = 0;
  for (const row of rows) cost += (costMap.get(String(row._id)) ?? 0) * row.quantity;
  return round2(cost);
}

function fillSeries(
  fromKey: string,
  toKey: string,
  map: Map<string, Record<string, number>>,
  base: Record<string, number>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let key = fromKey;
  let guard = 0;
  while (key <= toKey && guard < 400) {
    out.push({ date: key, ...base, ...(map.get(key) ?? {}) });
    key = addDays(key, 1);
    guard++;
  }
  return out;
}

function monthKeysBetween(fromKey: string, toKey: string): string[] {
  const months: string[] = [];
  let current = fromKey.slice(0, 7);
  const end = toKey.slice(0, 7);
  let guard = 0;
  while (current <= end && guard < 120) {
    months.push(current);
    const [y, m] = current.split('-').map(Number);
    current = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    guard++;
  }
  return months;
}

async function staffAvailabilityToday() {
  const todayKey = localDateKey();
  const weekday = localWeekday(todayKey);
  const [barbers, leaves, bookedAgg, nextAgg] = await Promise.all([
    StaffProfile.find({ isActive: true, role: 'barber' }).select('name weeklySchedule').lean(),
    StaffLeave.find({ status: 'approved', startDate: { $lte: todayKey }, endDate: { $gte: todayKey } })
      .select('staff')
      .lean(),
    Appointment.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { date: todayKey, status: { $in: BUSY_STATUSES } } },
      { $group: { _id: '$staff', count: { $sum: 1 } } },
    ]),
    Appointment.aggregate<{ _id: Types.ObjectId; next: Date }>([
      { $match: { date: todayKey, status: { $in: BUSY_STATUSES }, startsAt: { $gte: new Date() } } },
      { $sort: { startsAt: 1 } },
      { $group: { _id: '$staff', next: { $first: '$startsAt' } } },
    ]),
  ]);
  const onLeave = new Set(leaves.map((l) => String(l.staff)));
  const bookedMap = new Map(bookedAgg.map((b) => [String(b._id), b.count]));
  const nextMap = new Map(nextAgg.map((n) => [String(n._id), n.next]));

  return barbers.map((b) => {
    const day = b.weeklySchedule?.find((d) => d.day === weekday);
    const isLeave = onLeave.has(String(b._id));
    const working = !isLeave && Boolean(day?.isWorking);
    return {
      staffId: String(b._id),
      name: b.name,
      onLeave: isLeave,
      working,
      windows: working && day ? [{ start: day.start, end: day.end, breaks: day.breaks ?? [] }] : [],
      bookedCount: bookedMap.get(String(b._id)) ?? 0,
      nextAppointmentAt: nextMap.get(String(b._id)) ?? null,
    };
  });
}

export async function dashboard(req: Request) {
  const user = req.user!;
  const isBarber = user.role === 'barber';
  const staffScope =
    isBarber && user.staffId && mongoose.isValidObjectId(user.staffId)
      ? new Types.ObjectId(user.staffId)
      : undefined;
  const apptScope: Record<string, unknown> = staffScope ? { staff: staffScope } : {};

  const q = req.query as Record<string, string | undefined>;
  const period = rangeFromQuery(q, { defaultThisMonth: true });
  const today = todayRange();
  const todayKey = today.dateKey;

  const periodApptMatch = { ...apptScope, date: { $gte: period.fromKey, $lte: period.toKey } };

  const [todayCount, upcoming, countsAgg] = await Promise.all([
    Appointment.countDocuments({ ...apptScope, date: todayKey, status: { $ne: 'cancelled' } }),
    Appointment.find({
      ...apptScope,
      date: todayKey,
      startsAt: { $gte: new Date() },
      status: { $in: BUSY_STATUSES },
    })
      .sort({ startsAt: 1 })
      .limit(8)
      .select('reference startsAt status serviceSnapshot customer staff')
      .populate('customer', 'name')
      .populate('staff', 'name')
      .lean(),
    Appointment.aggregate<{ _id: string; count: number }>([
      { $match: periodApptMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const countsMap = new Map(countsAgg.map((c) => [c._id, c.count]));
  const totalBookings = countsAgg.reduce((s, c) => s + c.count, 0);
  const counts = {
    totalBookings,
    completedServices: countsMap.get('completed') ?? 0,
    pendingConfirmations: countsMap.get('pending') ?? 0,
    cancellations: countsMap.get('cancelled') ?? 0,
    noShows: countsMap.get('no_show') ?? 0,
  };

  const [todaySales, monthSales, expenseAgg, periodSales, productCost] = await Promise.all([
    sumPayments(today.from, today.to),
    sumPayments(monthRange(todayKey).from, monthRange(todayKey).to),
    Expense.aggregate<{ total: number }>([
      { $match: { date: { $gte: period.from, $lt: period.to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    sumPayments(period.from, period.to),
    productCostInRange(period.from, period.to),
  ]);
  const periodExpenses = round2(expenseAgg[0]?.total ?? 0);
  const estimatedProfit = subtractMoney(subtractMoney(periodSales.net, productCost), periodExpenses);

  const newCustomers = await CustomerProfile.countDocuments({
    createdAt: { $gte: period.from, $lt: period.to },
  });
  const returningCustomers = await CustomerProfile.countDocuments({ totalVisits: { $gt: 1 } });

  const popularServices = await Appointment.aggregate<{
    _id: Types.ObjectId;
    name: string;
    count: number;
  }>([
    { $match: { ...periodApptMatch, status: 'completed' } },
    { $group: { _id: '$service', name: { $first: '$serviceSnapshot.name' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  const seriesFromKey = addDays(todayKey, -29);
  const [bookingsAgg, revenueAgg] = await Promise.all([
    Appointment.aggregate<{ _id: { date: string; status: string }; count: number }>([
      { $match: { ...apptScope, date: { $gte: seriesFromKey, $lte: todayKey } } },
      { $group: { _id: { date: '$date', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ _id: string; revenue: number }>([
      {
        $match: {
          status: { $in: [...CAPTURED] },
          paidAt: { $gte: startOfLocalDay(seriesFromKey), $lt: endOfLocalDay(todayKey) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: tz() } },
          revenue: { $sum: { $subtract: ['$amount', '$refundedAmount'] } },
        },
      },
    ]),
  ]);

  const bookingMap = new Map<string, Record<string, number>>();
  for (const row of bookingsAgg) {
    const entry = bookingMap.get(row._id.date) ?? { bookings: 0, cancellations: 0 };
    entry.bookings += row.count;
    if (row._id.status === 'cancelled') entry.cancellations += row.count;
    bookingMap.set(row._id.date, entry);
  }
  const revenueMap = new Map(revenueAgg.map((r) => [r._id, { revenue: round2(r.revenue) }]));

  const response: Record<string, unknown> = {
    scope: isBarber ? 'barber' : 'all',
    period: { from: period.fromKey, to: period.toKey },
    today: { date: todayKey, appointments: todayCount, upcoming },
    counts,
    customers: { new: newCustomers, returning: returningCustomers },
    staffAvailability: await staffAvailabilityToday(),
    popularServices: popularServices.map((p) => ({
      serviceId: p._id ? String(p._id) : null,
      name: p.name,
      count: p.count,
    })),
    series: {
      bookings: fillSeries(seriesFromKey, todayKey, bookingMap, { bookings: 0, cancellations: 0 }),
      revenue: isBarber
        ? null
        : fillSeries(seriesFromKey, todayKey, revenueMap, { revenue: 0 }),
    },
  };

  if (isBarber) {
    Object.assign(response, {
      sales: null,
      expenses: null,
      estimatedProfit: null,
      barber: {
        upcomingAppointments: await Appointment.find({
          ...(staffScope ? { staff: staffScope } : {}),
          startsAt: { $gte: new Date() },
          status: { $in: BUSY_STATUSES },
        })
          .sort({ startsAt: 1 })
          .limit(10)
          .select('reference startsAt status serviceSnapshot customer')
          .populate('customer', 'name')
          .lean(),
        completedToday: await Appointment.countDocuments({
          ...(staffScope ? { staff: staffScope } : {}),
          status: 'completed',
          date: todayKey,
        }),
      },
    });
  } else {
    Object.assign(response, {
      sales: { daily: todaySales.gross, monthly: monthSales.net },
      expenses: periodExpenses,
      estimatedProfit,
      estimatedProfitNote:
        'Estimate = net sales − cost price of products sold (current cost) − expenses. Not tax-adjusted.',
    });
  }

  return response;
}

export async function salesReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);
  const groupBy = q.groupBy === 'week' || q.groupBy === 'month' ? q.groupBy : 'day';
  const format = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%G-W%V' : '%Y-%m-%d';

  const [series, refunds] = await Promise.all([
    Payment.aggregate<{ _id: { period: string; method: string }; total: number; count: number }>([
      {
        $match: {
          status: { $in: [...CAPTURED] },
          paidAt: { $gte: range.from, $lt: range.to },
        },
      },
      {
        $group: {
          _id: {
            period: { $dateToString: { format, date: '$paidAt', timezone: tz() } },
            method: '$method',
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.period': 1 } },
    ]),
    Payment.aggregate<{ _id: { period: string; method: string }; total: number; count: number }>([
      { $match: { refundedAmount: { $gt: 0 }, paidAt: { $gte: range.from, $lt: range.to } } },
      {
        $group: {
          _id: {
            period: { $dateToString: { format, date: '$paidAt', timezone: tz() } },
            method: '$method',
          },
          total: { $sum: '$refundedAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.period': 1 } },
    ]),
  ]);

  const summary = await sumPayments(range.from, range.to);
  const byMethod = new Map<string, number>();
  for (const row of series) byMethod.set(row._id.method, addMoney(byMethod.get(row._id.method) ?? 0, row.total));

  return {
    data: {
      groupBy,
      series: series.map((r) => ({ period: r._id.period, method: r._id.method, total: round2(r.total), count: r.count })),
      refunds: refunds.map((r) => ({ period: r._id.period, method: r._id.method, total: round2(r.total), count: r.count })),
      byMethod: [...byMethod.entries()].map(([method, total]) => ({ method, total })),
    },
    meta: { summary, from: range.fromKey, to: range.toKey },
  };
}

export async function servicesReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);

  const [apptAgg, revAgg, services] = await Promise.all([
    Appointment.aggregate<{
      _id: Types.ObjectId;
      name: string;
      bookings: number;
      cancelled: number;
    }>([
      { $match: { date: { $gte: range.fromKey, $lte: range.toKey } } },
      {
        $group: {
          _id: '$service',
          name: { $first: '$serviceSnapshot.name' },
          bookings: { $sum: 1 },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
    ]),
    Invoice.aggregate<{ _id: Types.ObjectId; revenue: number; sold: number }>([
      { $match: { issuedAt: { $gte: range.from, $lt: range.to }, status: { $ne: 'void' } } },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service', 'items.refId': { $ne: null } } },
      { $group: { _id: '$items.refId', revenue: { $sum: '$items.total' }, sold: { $sum: '$items.quantity' } } },
    ]),
    Service.find().select('name').lean(),
  ]);

  const serviceNames = new Map(services.map((s) => [String(s._id), s.name]));
  const merged = new Map<string, { serviceId: string; name: string; bookings: number; cancelled: number; revenue: number; sold: number }>();

  for (const row of apptAgg) {
    const id = String(row._id);
    merged.set(id, {
      serviceId: id,
      name: serviceNames.get(id) ?? row.name,
      bookings: row.bookings,
      cancelled: row.cancelled,
      revenue: 0,
      sold: 0,
    });
  }
  for (const row of revAgg) {
    const id = String(row._id);
    const entry = merged.get(id) ?? {
      serviceId: id,
      name: serviceNames.get(id) ?? 'Service',
      bookings: 0,
      cancelled: 0,
      revenue: 0,
      sold: 0,
    };
    entry.revenue = round2(row.revenue);
    entry.sold = row.sold;
    merged.set(id, entry);
  }

  const data = [...merged.values()].sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
  return { data, meta: { from: range.fromKey, to: range.toKey } };
}

export async function staffReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);

  const [staff, completedAgg, revAgg, leaves] = await Promise.all([
    StaffProfile.find().select('name role commissionPercent isActive').lean(),
    Appointment.aggregate<{ _id: Types.ObjectId; completed: number }>([
      { $match: { status: 'completed', date: { $gte: range.fromKey, $lte: range.toKey } } },
      { $group: { _id: '$staff', completed: { $sum: 1 } } },
    ]),
    Invoice.aggregate<{ _id: Types.ObjectId; revenue: number }>([
      { $match: { issuedAt: { $gte: range.from, $lt: range.to }, status: { $ne: 'void' } } },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service', 'items.staff': { $ne: null } } },
      { $group: { _id: '$items.staff', revenue: { $sum: '$items.total' } } },
    ]),
    StaffLeave.find({
      status: 'approved',
      startDate: { $lte: range.toKey },
      endDate: { $gte: range.fromKey },
    })
      .select('staff startDate endDate')
      .lean(),
  ]);

  const completedMap = new Map(completedAgg.map((c) => [String(c._id), c.completed]));
  const revMap = new Map(revAgg.map((r) => [String(r._id), round2(r.revenue)]));
  const leaveDays = new Map<string, number>();
  for (const leave of leaves) {
    const start = leave.startDate > range.fromKey ? leave.startDate : range.fromKey;
    const end = leave.endDate < range.toKey ? leave.endDate : range.toKey;
    const days =
      Math.floor((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86400000) + 1;
    if (days > 0) leaveDays.set(String(leave.staff), (leaveDays.get(String(leave.staff)) ?? 0) + days);
  }

  const data = staff.map((member) => {
    const revenue = revMap.get(String(member._id)) ?? 0;
    const commissionPercent = member.commissionPercent ?? 0;
    return {
      staffId: String(member._id),
      name: member.name,
      role: member.role,
      completed: completedMap.get(String(member._id)) ?? 0,
      revenue,
      commissionPercent,
      commission: percentOf(revenue, commissionPercent),
      leaveDays: leaveDays.get(String(member._id)) ?? 0,
    };
  });

  return { data, meta: { from: range.fromKey, to: range.toKey } };
}

export async function bookingsReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);
  const match = { date: { $gte: range.fromKey, $lte: range.toKey } };

  const [statusAgg, sourceAgg, hourAgg] = await Promise.all([
    Appointment.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Appointment.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Appointment.aggregate<{ _id: number; count: number }>([
      { $match: { ...match, status: { $nin: ['cancelled'] } } },
      { $group: { _id: { $hour: { date: '$startsAt', timezone: tz() } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const byStatus = new Map(statusAgg.map((s) => [s._id, s.count]));
  const total = statusAgg.reduce((sum, s) => sum + s.count, 0);
  const cancelled = byStatus.get('cancelled') ?? 0;
  const noShow = byStatus.get('no_show') ?? 0;

  return {
    data: {
      byStatus: statusAgg.map((s) => ({ status: s._id, count: s.count })),
      bySource: sourceAgg.map((s) => ({ source: s._id, count: s.count })),
      byHour: hourAgg.map((h) => ({ hour: h._id, count: h.count })),
      total,
      noShowRate: total ? round2((noShow / total) * 100) : 0,
      cancellationRate: total ? round2((cancelled / total) * 100) : 0,
    },
    meta: { from: range.fromKey, to: range.toKey },
  };
}

export async function customersReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);

  const [newCustomers, visitAgg, spendAgg, inactive] = await Promise.all([
    CustomerProfile.countDocuments({ createdAt: { $gte: range.from, $lt: range.to } }),
    Appointment.aggregate<{ _id: Types.ObjectId; visits: number }>([
      { $match: { status: 'completed', date: { $gte: range.fromKey, $lte: range.toKey }, customer: { $ne: null } } },
      { $group: { _id: '$customer', visits: { $sum: 1 } } },
    ]),
    Invoice.aggregate<{ _id: Types.ObjectId; spend: number; visits: number }>([
      {
        $match: {
          issuedAt: { $gte: range.from, $lt: range.to },
          status: { $in: ['paid', 'partially_paid'] },
          customer: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$customer',
          spend: { $sum: { $subtract: ['$amountPaid', '$refundedAmount'] } },
          visits: { $sum: 1 },
        },
      },
      { $sort: { spend: -1 } },
      { $limit: 10 },
    ]),
    CustomerProfile.countDocuments({
      isActive: true,
      $or: [{ lastVisitAt: { $lt: new Date(Date.now() - 90 * 86400000) } }, { lastVisitAt: null }],
    }),
  ]);

  const activeCustomers = visitAgg.length;
  const returning = visitAgg.filter((v) => v.visits >= 2).length;
  const customerDocs = await CustomerProfile.find({ _id: { $in: spendAgg.map((s) => s._id) } })
    .select('name email phone')
    .lean();
  const names = new Map(customerDocs.map((c) => [String(c._id), c]));

  return {
    data: {
      newCustomers,
      returningCustomers: returning,
      activeCustomersInPeriod: activeCustomers,
      retentionRate: activeCustomers ? round2((returning / activeCustomers) * 100) : 0,
      inactiveCustomers: inactive,
      topCustomers: spendAgg.map((s) => ({
        customerId: String(s._id),
        name: names.get(String(s._id))?.name ?? 'Customer',
        email: names.get(String(s._id))?.email,
        spend: round2(s.spend),
        invoices: s.visits,
      })),
    },
    meta: { from: range.fromKey, to: range.toKey },
  };
}

export async function inventoryReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);

  const [valueAgg, lowStock, moving, deadStock] = await Promise.all([
    Product.aggregate<{ totalValue: number; totalUnits: number }>([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalValue: { $sum: { $multiply: ['$stockQuantity', '$costPrice'] } },
          totalUnits: { $sum: '$stockQuantity' },
        },
      },
    ]),
    Product.find({ isActive: true, $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } })
      .select('name sku stockQuantity lowStockThreshold')
      .sort({ stockQuantity: 1 })
      .lean(),
    InventoryTransaction.aggregate<{ _id: Types.ObjectId; moved: number }>([
      { $match: { type: { $in: ['out', 'sale'] }, createdAt: { $gte: range.from, $lt: range.to } } },
      { $group: { _id: '$product', moved: { $sum: '$quantity' } } },
      { $sort: { moved: -1 } },
      { $limit: 10 },
    ]),
    (async () => {
      const since = new Date(Date.now() - 60 * 86400000);
      const active = await InventoryTransaction.distinct('product', { createdAt: { $gte: since } });
      return Product.find({ isActive: true, stockQuantity: { $gt: 0 }, _id: { $nin: active } })
        .select('name sku stockQuantity')
        .limit(50)
        .lean();
    })(),
  ]);

  const movingDocs = await Product.find({ _id: { $in: moving.map((m) => m._id) } })
    .select('name sku')
    .lean();
  const movingNames = new Map(movingDocs.map((p) => [String(p._id), p]));

  return {
    data: {
      totalStockValue: round2(valueAgg[0]?.totalValue ?? 0),
      totalUnits: valueAgg[0]?.totalUnits ?? 0,
      lowStockCount: lowStock.length,
      lowStock,
      topMovingProducts: moving.map((m) => ({
        productId: String(m._id),
        name: movingNames.get(String(m._id))?.name ?? 'Product',
        sku: movingNames.get(String(m._id))?.sku,
        moved: m.moved,
      })),
      deadStock,
      deadStockCount: deadStock.length,
    },
    meta: { from: range.fromKey, to: range.toKey },
  };
}

export async function expensesReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);
  const match = { date: { $gte: range.from, $lt: range.to } };

  const [byCategory, monthly] = await Promise.all([
    Expense.aggregate<{ _id: string; total: number; count: number }>([
      { $match: match },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate<{ _id: string; total: number }>([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz() } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    data: {
      byCategory: byCategory.map((c) => ({ category: c._id, total: round2(c.total), count: c.count })),
      monthly: monthly.map((m) => ({ month: m._id, total: round2(m.total) })),
      total: round2(byCategory.reduce((s, c) => s + c.total, 0)),
    },
    meta: { from: range.fromKey, to: range.toKey },
  };
}

export async function outstandingReport(req: Request) {
  const p: Pagination = parsePagination(req, 'createdAt');
  const filter: Record<string, unknown> = {
    balanceDue: { $gt: 0 },
    status: { $nin: ['void', 'draft'] },
  };
  const [docs, total, agg] = await Promise.all([
    Invoice.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('customer', 'name email phone')
      .lean(),
    Invoice.countDocuments(filter),
    Invoice.aggregate<{ total: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$balanceDue' } } },
    ]),
  ]);
  const response = buildListResponse(docs, total, p);
  return { ...response, meta: { ...response.meta, summary: { totalOutstanding: round2(agg[0]?.total ?? 0) } } };
}

export async function profitReport(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const range = rangeFromQuery(q);

  const [revenue, productCost, expenseAgg, expenseMonthly, costRows] = await Promise.all([
    sumPayments(range.from, range.to),
    productCostInRange(range.from, range.to),
    Expense.aggregate<{ total: number }>([
      { $match: { date: { $gte: range.from, $lt: range.to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Expense.aggregate<{ _id: string; total: number }>([
      { $match: { date: { $gte: range.from, $lt: range.to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz() } }, total: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate<{ _id: { month: string; product: Types.ObjectId }; quantity: number }>([
      { $match: { issuedAt: { $gte: range.from, $lt: range.to }, status: { $ne: 'void' } } },
      { $unwind: '$items' },
      { $match: { 'items.type': 'product', 'items.refId': { $ne: null } } },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$issuedAt', timezone: tz() } },
            product: '$items.refId',
          },
          quantity: { $sum: '$items.quantity' },
        },
      },
    ]),
  ]);

  const expenses = round2(expenseAgg[0]?.total ?? 0);
  const grossProfit = subtractMoney(subtractMoney(revenue.net, productCost), expenses);
  const margin = revenue.net ? round2((grossProfit / revenue.net) * 100) : 0;

  const productIds = [...new Set(costRows.map((r) => String(r._id.product)))];
  const products = await Product.find({ _id: { $in: productIds } }).select('costPrice').lean();
  const costMap = new Map(products.map((p) => [String(p._id), p.costPrice]));
  const costByMonth = new Map<string, number>();
  for (const row of costRows) {
    const cost = (costMap.get(String(row._id.product)) ?? 0) * row.quantity;
    costByMonth.set(row._id.month, addMoney(costByMonth.get(row._id.month) ?? 0, cost));
  }
  const expenseByMonth = new Map(expenseMonthly.map((e) => [e._id, round2(e.total)]));
  const revenueByMonth = await Payment.aggregate<{ _id: string; revenue: number }>([
    { $match: { status: { $in: [...CAPTURED] }, paidAt: { $gte: range.from, $lt: range.to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: tz() } },
        revenue: { $sum: { $subtract: ['$amount', '$refundedAmount'] } },
      },
    },
  ]);
  const revByMonth = new Map(revenueByMonth.map((r) => [r._id, round2(r.revenue)]));

  const monthly = monthKeysBetween(range.fromKey, range.toKey).map((month) => {
    const rev = revByMonth.get(month) ?? 0;
    const cost = costByMonth.get(month) ?? 0;
    const exp = expenseByMonth.get(month) ?? 0;
    return { month, revenue: rev, productCost: cost, expenses: exp, profit: subtractMoney(subtractMoney(rev, cost), exp) };
  });

  return {
    data: {
      revenue: { gross: revenue.gross, refunds: revenue.refunds, net: revenue.net },
      estimatedProductCost: productCost,
      expenses,
      estimatedGrossProfit: grossProfit,
      marginPercent: margin,
      monthly,
      note: 'Estimates use current product cost prices and are not tax-adjusted.',
    },
    meta: { from: range.fromKey, to: range.toKey },
  };
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const esc = (value: unknown) => {
    const s = value == null ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

export type ExportName =
  | 'sales'
  | 'services'
  | 'staff'
  | 'bookings'
  | 'customers'
  | 'expenses'
  | 'outstanding'
  | 'inventory';

export async function exportCsv(
  name: ExportName,
  req: Request
): Promise<{ filename: string; csv: string }> {
  let columns: { key: string; label: string }[] = [];
  let rows: Record<string, unknown>[] = [];
  const range = rangeFromQuery(req.query as Record<string, string | undefined>);

  if (name === 'sales') {
    const report = await salesReport(req);
    columns = [
      { key: 'period', label: 'Period' },
      { key: 'method', label: 'Method' },
      { key: 'total', label: 'Total' },
      { key: 'count', label: 'Count' },
    ];
    rows = report.data.series;
  } else if (name === 'services') {
    const report = await servicesReport(req);
    columns = [
      { key: 'name', label: 'Service' },
      { key: 'bookings', label: 'Bookings' },
      { key: 'cancelled', label: 'Cancelled' },
      { key: 'sold', label: 'Sold' },
      { key: 'revenue', label: 'Revenue' },
    ];
    rows = report.data;
  } else if (name === 'staff') {
    const report = await staffReport(req);
    columns = [
      { key: 'name', label: 'Staff' },
      { key: 'role', label: 'Role' },
      { key: 'completed', label: 'Completed' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'commission', label: 'Commission' },
      { key: 'leaveDays', label: 'Leave days' },
    ];
    rows = report.data;
  } else if (name === 'bookings') {
    const report = await bookingsReport(req);
    columns = [
      { key: 'status', label: 'Status' },
      { key: 'count', label: 'Count' },
    ];
    rows = report.data.byStatus;
  } else if (name === 'customers') {
    const report = await customersReport(req);
    columns = [
      { key: 'name', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'invoices', label: 'Invoices' },
      { key: 'spend', label: 'Spend' },
    ];
    rows = report.data.topCustomers;
  } else if (name === 'expenses') {
    const docs = await Expense.find({ date: { $gte: range.from, $lt: range.to } }).sort({ date: 1 }).lean();
    columns = [
      { key: 'date', label: 'Date' },
      { key: 'category', label: 'Category' },
      { key: 'title', label: 'Title' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'amount', label: 'Amount' },
    ];
    rows = docs.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      category: d.category,
      title: d.title,
      vendor: d.vendor ?? '',
      amount: d.amount,
    }));
  } else if (name === 'outstanding') {
    const docs = await Invoice.find({ balanceDue: { $gt: 0 }, status: { $nin: ['void', 'draft'] } })
      .sort({ createdAt: 1 })
      .populate('customer', 'name')
      .lean();
    columns = [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'customer', label: 'Customer' },
      { key: 'issuedAt', label: 'Issued' },
      { key: 'total', label: 'Total' },
      { key: 'balanceDue', label: 'Balance due' },
    ];
    rows = docs.map((d) => ({
      invoiceNumber: d.invoiceNumber,
      customer: (d.customer as unknown as { name?: string } | undefined)?.name ?? '',
      issuedAt: d.issuedAt ? new Date(d.issuedAt).toISOString().slice(0, 10) : '',
      total: d.total,
      balanceDue: d.balanceDue,
    }));
  } else {
    const report = await inventoryReport(req);
    columns = [
      { key: 'name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'stockQuantity', label: 'Stock' },
      { key: 'lowStockThreshold', label: 'Low stock threshold' },
    ];
    rows = report.data.lowStock;
  }

  const csv = toCsv(columns, rows);
  return { filename: `salonpro-${name}-${range.fromKey}-${range.toKey}.csv`, csv };
}
