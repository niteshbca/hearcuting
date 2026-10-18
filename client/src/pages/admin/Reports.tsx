import { useState } from "react";
import type { ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  DollarSign,
  Download,
  LineChart as LineChartIcon,
  Package,
  Percent,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiGetList } from "@/services/api";
import type { DashboardData, Invoice, PaginationMeta } from "@/types";
import { personName } from "@/types";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { API_BASE } from "@/lib/apiBase";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { DateRangePicker, type DateRangeValue } from "@/components/shared/DateRangePicker";
import { StatCard } from "@/components/shared/StatCard";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 15;

const GOLD = "#C6A15B";
const INK = "#232326";
const SUCCESS = "#1F7A4D";
const DANGER = "#B3261E";
const INFO = "#1F5FA8";
const WARNING = "#9A6B00";
const PALETTE = [GOLD, INK, SUCCESS, INFO, DANGER, WARNING, "#8B5CF6", "#0EA5E9"];

/* ------------------------------- Response types ------------------------------ */
/* Report endpoints return `{ data, meta }`; `apiGet` unwraps to the inner `data`. */

interface SalesData {
  groupBy: "day" | "week" | "month";
  series: { period: string; method: string; total: number; count: number }[];
  refunds: { period: string; method: string; total: number; count: number }[];
  byMethod: { method: string; total: number }[];
}

interface ServiceRow {
  serviceId: string;
  name: string;
  bookings: number;
  cancelled: number;
  revenue: number;
  sold: number;
}

interface StaffRow {
  staffId: string;
  name: string;
  role: string;
  completed: number;
  revenue: number;
  commissionPercent: number;
  commission: number;
  leaveDays: number;
}

interface BookingsData {
  byStatus: { status: string; count: number }[];
  bySource: { source: string; count: number }[];
  byHour: { hour: number; count: number }[];
  total: number;
  noShowRate: number;
  cancellationRate: number;
}

interface CustomersData {
  newCustomers: number;
  returningCustomers: number;
  activeCustomersInPeriod: number;
  retentionRate: number;
  inactiveCustomers: number;
  topCustomers: { customerId: string; name: string; email?: string; spend: number; invoices: number }[];
}

interface InventoryData {
  totalStockValue: number;
  totalUnits: number;
  lowStockCount: number;
  lowStock: { id?: string; _id?: string; name: string; sku: string; stockQuantity: number; lowStockThreshold: number }[];
  topMovingProducts: { productId: string; name: string; sku?: string; moved: number }[];
  deadStock: { id?: string; _id?: string; name: string; sku: string; stockQuantity: number }[];
  deadStockCount: number;
}

interface ExpensesData {
  byCategory: { category: string; total: number; count: number }[];
  monthly: { month: string; total: number }[];
  total: number;
}

interface ProfitData {
  revenue: { gross: number; refunds: number; net: number };
  estimatedProductCost: number;
  expenses: number;
  estimatedGrossProfit: number;
  marginPercent: number;
  monthly: { month: string; revenue: number; productCost: number; expenses: number; profit: number }[];
  note: string;
}

type OutstandingMeta = PaginationMeta & { summary?: { totalOutstanding: number } };

/* --------------------------------- Helpers ---------------------------------- */

function params(range: DateRangeValue): Record<string, string | undefined> {
  return { from: range.from, to: range.to };
}

function exportUrl(name: string, range: DateRangeValue): string {
  const search = new URLSearchParams();
  if (range.from) search.set("from", range.from);
  if (range.to) search.set("to", range.to);
  const qs = search.toString();
  return `${API_BASE}/reports/${name}/export${qs ? `?${qs}` : ""}`;
}

function ExportLink({ name, range }: { name: string; range: DateRangeValue }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={exportUrl(name, range)} download>
        <Download className="h-4 w-4" /> Export CSV
      </a>
    </Button>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 280 }}>{children}</div>
      </CardContent>
    </Card>
  );
}

function currencyTick(value: number | string): string {
  return formatCurrency(Number(value));
}

function QueryBoundary({
  isLoading,
  isError,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (isLoading) return <LoadingState label="Crunching the numbers…" />;
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load this report"
        message={parseApiError(error).message}
        onRetry={onRetry}
      />
    );
  }
  return <>{children}</>;
}

/* --------------------------------- Tabs ------------------------------------- */

function OverviewTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "dashboard", range],
    queryFn: () => apiGet<DashboardData>("/reports/dashboard", params(range)),
  });

  const data = query.data;
  const series =
    data?.series.bookings.map((point, index) => ({
      date: point.date,
      bookings: point.bookings ?? 0,
      revenue: data.series.revenue?.[index]?.revenue ?? 0,
    })) ?? [];

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Appointments today" value={data.today.appointments} icon={CalendarCheck} hint={data.today.date} />
            <StatCard label="Sales today" value={<Money amount={data.sales?.daily ?? 0} />} icon={DollarSign} accent="success" />
            <StatCard label="Sales this month" value={<Money amount={data.sales?.monthly ?? 0} />} icon={TrendingUp} accent="ink" />
            <StatCard label="Estimated profit" value={<Money amount={data.estimatedProfit ?? 0} />} icon={Wallet} accent="gold" hint="This period" />
          </div>
          <ChartCard title="Bookings & revenue trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="bookings" stroke={GOLD} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="revenue" stroke={SUCCESS} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}
    </QueryBoundary>
  );
}

function SalesTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "sales", range],
    queryFn: () => apiGet<SalesData>("/reports/sales", params(range)),
  });

  const data = query.data;
  const series = data?.series ?? [];
  const refunds = data?.refunds ?? [];

  const byPeriod = new Map<string, number>();
  for (const row of series) {
    byPeriod.set(row.period, (byPeriod.get(row.period) ?? 0) + row.total);
  }
  const trend = [...byPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, total]) => ({ period, total }));
  const methods = (data?.byMethod ?? []).map((m) => ({ name: m.method, value: m.total }));

  const gross = series.reduce((sum, row) => sum + row.total, 0);
  const refundsTotal = refunds.reduce((sum, row) => sum + row.total, 0);
  const count = series.reduce((sum, row) => sum + row.count, 0);

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="sales" range={range} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Gross sales" value={<Money amount={gross} />} icon={DollarSign} accent="gold" />
          <StatCard label="Refunds" value={<Money amount={refundsTotal} />} icon={Receipt} accent="danger" />
          <StatCard label="Net sales" value={<Money amount={gross - refundsTotal} />} icon={TrendingUp} accent="success" />
          <StatCard label="Payments" value={count} icon={BarChart3} accent="ink" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Sales over time">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={currencyTick} width={80} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="total" fill={GOLD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <ChartCard title="By payment method">
            {methods.length === 0 ? (
              <EmptyState icon={BarChart3} title="No payments" description="No captured payments in this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={methods} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {methods.map((entry, index) => (
                      <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </QueryBoundary>
  );
}

function BookingsTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "bookings", range],
    queryFn: () => apiGet<BookingsData>("/reports/bookings", params(range)),
  });

  const data = query.data;
  const hours = (data?.byHour ?? []).map((h) => ({ hour: `${String(h.hour).padStart(2, "0")}:00`, count: h.count }));
  const statuses = (data?.byStatus ?? []).map((s) => ({ name: s.status.replace(/_/g, " "), value: s.count }));
  const sources = (data?.bySource ?? []).map((s) => ({ name: s.source.replace(/_/g, " "), count: s.count }));

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="bookings" range={range} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total bookings" value={data?.total ?? 0} icon={CalendarCheck} accent="gold" />
          <StatCard label="Cancellation rate" value={`${data?.cancellationRate ?? 0}%`} icon={Percent} accent="danger" />
          <StatCard label="No-show rate" value={`${data?.noShowRate ?? 0}%`} icon={Percent} accent="ink" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Bookings by hour">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hours}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Status breakdown">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statuses} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {statuses.map((entry, index) => (
                    <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Booking sources">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sources}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={INK} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </QueryBoundary>
  );
}

function ServicesTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "services", range],
    queryFn: () => apiGet<ServiceRow[]>("/reports/services", params(range)),
  });

  const data = query.data ?? [];
  const top = data.slice(0, 8).map((s) => ({ name: s.name, revenue: s.revenue, bookings: s.bookings }));

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="services" range={range} />
        </div>
        {data.length === 0 ? (
          <EmptyState icon={BarChart3} title="No service activity" description="Nothing sold or booked in this range." />
        ) : (
          <>
            <ChartCard title="Top services by revenue">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={currencyTick} width={80} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">Cancelled</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((service) => (
                      <TableRow key={service.serviceId}>
                        <TableCell className="font-medium text-ink">{service.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{service.bookings}</TableCell>
                        <TableCell className="text-right tabular-nums">{service.cancelled}</TableCell>
                        <TableCell className="text-right tabular-nums">{service.sold}</TableCell>
                        <TableCell className="text-right">
                          <Money amount={service.revenue} emphasis />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </QueryBoundary>
  );
}

function StaffTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "staff", range],
    queryFn: () => apiGet<StaffRow[]>("/reports/staff", params(range)),
  });

  const data = query.data ?? [];
  const chart = data.map((s) => ({ name: s.name, revenue: s.revenue, commission: s.commission }));

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="staff" range={range} />
        </div>
        {data.length === 0 ? (
          <EmptyState icon={Users} title="No staff activity" description="No completed appointments in this range." />
        ) : (
          <>
            <ChartCard title="Revenue & commission by staff">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={currencyTick} width={80} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="commission" fill={INK} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Leave days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((member) => (
                      <TableRow key={member.staffId}>
                        <TableCell className="font-medium text-ink">{member.name}</TableCell>
                        <TableCell className="capitalize text-ink-500">{member.role}</TableCell>
                        <TableCell className="text-right tabular-nums">{member.completed}</TableCell>
                        <TableCell className="text-right">
                          <Money amount={member.revenue} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money amount={member.commission} emphasis />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{member.leaveDays}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </QueryBoundary>
  );
}

function CustomersTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "customers", range],
    queryFn: () => apiGet<CustomersData>("/reports/customers", params(range)),
  });

  const data = query.data;

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="customers" range={range} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="New customers" value={data?.newCustomers ?? 0} icon={Users} accent="gold" />
          <StatCard label="Returning customers" value={data?.returningCustomers ?? 0} icon={Users} accent="success" />
          <StatCard label="Retention rate" value={`${data?.retentionRate ?? 0}%`} icon={Percent} accent="ink" />
          <StatCard label="Inactive (90d+)" value={data?.inactiveCustomers ?? 0} icon={Users} accent="danger" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Top customers by spend</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.topCustomers ?? []).length === 0 ? (
              <p className="p-6 text-sm text-ink-500">No paid invoices in this range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.topCustomers.map((customer) => (
                    <TableRow key={customer.customerId}>
                      <TableCell className="font-medium text-ink">{customer.name}</TableCell>
                      <TableCell className="text-ink-500">{customer.email ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{customer.invoices}</TableCell>
                      <TableCell className="text-right">
                        <Money amount={customer.spend} emphasis />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </QueryBoundary>
  );
}

function InventoryTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "inventory", range],
    queryFn: () => apiGet<InventoryData>("/reports/inventory", params(range)),
  });

  const data = query.data;
  const moving = (data?.topMovingProducts ?? []).map((p) => ({ name: p.name, moved: p.moved }));

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="inventory" range={range} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Stock value" value={<Money amount={data?.totalStockValue ?? 0} />} icon={Package} accent="gold" />
          <StatCard label="Units in stock" value={data?.totalUnits ?? 0} icon={Package} accent="ink" />
          <StatCard label="Low stock" value={data?.lowStockCount ?? 0} icon={Package} accent="danger" />
          <StatCard label="Dead stock" value={data?.deadStockCount ?? 0} icon={Package} accent="gold" />
        </div>
        {moving.length > 0 && (
          <ChartCard title="Top moving products">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moving} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="moved" fill={GOLD} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Low stock items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.lowStock ?? []).length === 0 ? (
              <p className="p-6 text-sm text-ink-500">Every product is above its threshold.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.lowStock.map((product) => (
                    <TableRow key={product.id ?? product._id ?? product.sku}>
                      <TableCell className="font-medium text-ink">{product.name}</TableCell>
                      <TableCell className="font-mono text-xs text-ink-500">{product.sku}</TableCell>
                      <TableCell className="text-right font-semibold text-danger">{product.stockQuantity}</TableCell>
                      <TableCell className="text-right">{product.lowStockThreshold}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </QueryBoundary>
  );
}

function ExpensesTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "expenses", range],
    queryFn: () => apiGet<ExpensesData>("/reports/expenses", params(range)),
  });

  const data = query.data;
  const byCategory = (data?.byCategory ?? []).map((c) => ({ name: c.category, value: c.total }));
  const monthly = data?.monthly ?? [];

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ExportLink name="expenses" range={range} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total expenses" value={<Money amount={data?.total ?? 0} />} icon={Receipt} accent="danger" />
          <StatCard label="Categories" value={byCategory.length} icon={BarChart3} accent="gold" />
          <StatCard label="Months tracked" value={monthly.length} icon={LineChartIcon} accent="ink" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="By category">
            {byCategory.length === 0 ? (
              <EmptyState icon={Receipt} title="No expenses" description="Nothing recorded in this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {byCategory.map((entry, index) => (
                      <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="Monthly expenses">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={currencyTick} width={80} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="total" fill={DANGER} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </QueryBoundary>
  );
}

function OutstandingTab({ range }: { range: DateRangeValue }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["reports", "outstanding", { page, range }],
    queryFn: () => apiGetList<Invoice>("/reports/outstanding", { ...params(range), page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const invoices = query.data?.data ?? [];
  const meta = query.data?.meta as OutstandingMeta | undefined;

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <StatCard
            label="Total outstanding"
            value={<Money amount={meta?.summary?.totalOutstanding ?? 0} />}
            icon={Receipt}
            accent="danger"
            className="w-full sm:max-w-xs"
          />
          <ExportLink name="outstanding" range={range} />
        </div>
        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing outstanding" description="Every invoice is fully settled." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs text-ink-500">{invoice.invoiceNumber}</TableCell>
                      <TableCell className="font-medium text-ink">{personName(invoice.customer) || "—"}</TableCell>
                      <TableCell>
                        <DateTime value={invoice.issuedAt} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={invoice.total} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={invoice.balanceDue} emphasis />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />}
      </div>
    </QueryBoundary>
  );
}

function ProfitTab({ range }: { range: DateRangeValue }) {
  const query = useQuery({
    queryKey: ["reports", "profit", range],
    queryFn: () => apiGet<ProfitData>("/reports/profit", params(range)),
  });

  const data = query.data;

  return (
    <QueryBoundary
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Net revenue" value={<Money amount={data?.revenue.net ?? 0} />} icon={DollarSign} accent="success" />
          <StatCard label="Product cost" value={<Money amount={data?.estimatedProductCost ?? 0} />} icon={Package} accent="ink" />
          <StatCard label="Expenses" value={<Money amount={data?.expenses ?? 0} />} icon={Receipt} accent="danger" />
          <StatCard
            label="Estimated gross profit"
            value={<Money amount={data?.estimatedGrossProfit ?? 0} />}
            icon={Wallet}
            accent="gold"
            hint={`${data?.marginPercent ?? 0}% margin`}
          />
        </div>
        <ChartCard title="Revenue vs profit">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.monthly ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E5" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={currencyTick} width={80} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} />
              <Line type="monotone" dataKey="expenses" stroke={DANGER} strokeWidth={2} />
              <Line type="monotone" dataKey="profit" stroke={SUCCESS} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        {data?.note && <p className="text-xs text-ink-400">{data.note}</p>}
      </div>
    </QueryBoundary>
  );
}

/* --------------------------------- Page ------------------------------------- */

export default function AdminReportsPage() {
  usePageMeta("Reports", "Sales, bookings and profitability.");
  const { can } = usePermission();
  const [range, setRange] = useState<DateRangeValue>({});

  const view = can("reports.view");
  const financial = can("reports.financial");
  const canCustomers = can("customers.view");
  const canInventory = can("inventory.view");
  const canExpenses = can("expenses.view");

  const tabs = [
    { value: "overview", label: "Overview", show: true },
    { value: "sales", label: "Sales", show: view },
    { value: "bookings", label: "Bookings", show: view },
    { value: "services", label: "Services", show: view },
    { value: "staff", label: "Staff", show: view },
    { value: "customers", label: "Customers", show: canCustomers },
    { value: "inventory", label: "Inventory", show: canInventory },
    { value: "expenses", label: "Expenses", show: canExpenses },
    { value: "outstanding", label: "Outstanding", show: financial },
    { value: "profit", label: "Profit", show: financial },
  ].filter((tab) => tab.show);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Sales, bookings, staff and profitability."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab range={range} />
        </TabsContent>
        {view && (
          <TabsContent value="sales">
            <SalesTab range={range} />
          </TabsContent>
        )}
        {view && (
          <TabsContent value="bookings">
            <BookingsTab range={range} />
          </TabsContent>
        )}
        {view && (
          <TabsContent value="services">
            <ServicesTab range={range} />
          </TabsContent>
        )}
        {view && (
          <TabsContent value="staff">
            <StaffTab range={range} />
          </TabsContent>
        )}
        {canCustomers && (
          <TabsContent value="customers">
            <CustomersTab range={range} />
          </TabsContent>
        )}
        {canInventory && (
          <TabsContent value="inventory">
            <InventoryTab range={range} />
          </TabsContent>
        )}
        {canExpenses && (
          <TabsContent value="expenses">
            <ExpensesTab range={range} />
          </TabsContent>
        )}
        {financial && (
          <TabsContent value="outstanding">
            <OutstandingTab range={range} />
          </TabsContent>
        )}
        {financial && (
          <TabsContent value="profit">
            <ProfitTab range={range} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
