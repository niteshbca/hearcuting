import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  CalendarClock,
  DollarSign,
  Scissors,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { apiGet } from "@/services/api";
import type { Appointment, DashboardData, StaffAvailabilityStat } from "@/types";
import { personName } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseApiError } from "@/lib/utils";

function MiniBars({ points, color }: { points: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Last 30 days trend">
      {points.map((point, index) => (
        <div
          key={`${point.label}-${index}`}
          title={`${point.label}: ${point.value}`}
          className={`min-w-0 flex-1 rounded-t-sm ${color}`}
          style={{ height: `${Math.max(4, (point.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function StaffAvailabilityRow({ stat }: { stat: StaffAvailabilityStat }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{stat.name}</p>
        <p className="text-xs text-ink-400">
          {stat.onLeave
            ? "On leave today"
            : stat.working && stat.windows.length > 0
              ? `${stat.windows[0]?.start} – ${stat.windows[0]?.end}`
              : "Not working today"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-ink-500">{stat.bookedCount} booked</span>
        {stat.onLeave ? (
          <Badge variant="danger">Leave</Badge>
        ) : stat.working ? (
          <Badge variant="success">Working</Badge>
        ) : (
          <Badge variant="muted">Off</Badge>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  usePageMeta("Dashboard", "Salon performance at a glance.");

  const query = useQuery({
    queryKey: ["reports", "dashboard"],
    queryFn: () => apiGet<DashboardData>("/reports/dashboard"),
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <LoadingState label="Loading dashboard…" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load the dashboard"
        message={parseApiError(query.error).message}
        onRetry={() => query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;

  const isBarber = data.scope === "barber";
  const upcoming = data.today.upcoming ?? [];
  const bookingSeries = data.series.bookings ?? [];
  const revenueSeries = data.series.revenue ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          isBarber
            ? "Your chair at a glance."
            : `Business overview · ${data.period.from} → ${data.period.to}`
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Appointments today"
          value={data.today.appointments}
          icon={CalendarDays}
          accent="gold"
          hint={data.today.date}
        />
        {data.sales ? (
          <>
            <StatCard
              label="Sales today"
              value={<Money amount={data.sales.daily} />}
              icon={DollarSign}
              accent="success"
            />
            <StatCard
              label="Sales this month"
              value={<Money amount={data.sales.monthly} />}
              icon={TrendingUp}
              accent="ink"
            />
          </>
        ) : (
          <StatCard
            label="Completed today"
            value={data.barber?.completedToday ?? 0}
            icon={Activity}
            accent="success"
          />
        )}
        <StatCard
          label="Pending confirmations"
          value={data.counts.pendingConfirmations}
          icon={CalendarClock}
          accent="gold"
        />
        {!isBarber && (
          <>
            <StatCard
              label="Estimated profit"
              value={<Money amount={data.estimatedProfit ?? 0} />}
              icon={Wallet}
              accent="ink"
              hint="This period"
            />
            <StatCard
              label="Expenses"
              value={<Money amount={data.expenses ?? 0} />}
              icon={Wallet}
              accent="danger"
              hint="This period"
            />
          </>
        )}
        <StatCard
          label="New customers"
          value={data.customers.new}
          icon={UserPlus}
          accent="gold"
          hint={`${data.customers.returning} returning`}
        />
        <StatCard
          label="Cancellations / no-shows"
          value={`${data.counts.cancellations} / ${data.counts.noShows}`}
          icon={Users}
          accent="danger"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">
                No upcoming appointments today.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {upcoming.map((appt: Appointment) => (
                  <div key={appt.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {appt.serviceSnapshot?.name ?? "Service"}
                      </p>
                      <p className="truncate text-xs text-ink-400">
                        {personName(appt.customer) || appt.guest?.name || "Walk-in"} ·{" "}
                        {personName(appt.staff) || "Any staff"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <DateTime value={appt.startsAt} showTime className="text-xs" />
                      <StatusBadge kind="booking" status={appt.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff availability today</CardTitle>
          </CardHeader>
          <CardContent>
            {data.staffAvailability.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">No active barbers found.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.staffAvailability.map((stat) => (
                  <StaffAvailabilityRow key={stat.staffId} stat={stat} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bookings · last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBars
              points={bookingSeries.map((point) => ({
                label: point.date,
                value: point.bookings ?? 0,
              }))}
              color="bg-gold"
            />
            <div className="mt-2 flex justify-between text-xs text-ink-400">
              <span>{bookingSeries[0]?.date ?? ""}</span>
              <span>Total: {data.counts.totalBookings}</span>
              <span>{bookingSeries[bookingSeries.length - 1]?.date ?? ""}</span>
            </div>
          </CardContent>
        </Card>

        {!isBarber ? (
          <Card>
            <CardHeader>
              <CardTitle>Revenue · last 30 days</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniBars
                points={revenueSeries.map((point) => ({
                  label: point.date,
                  value: point.revenue ?? 0,
                }))}
                color="bg-success"
              />
              <div className="mt-2 flex justify-between text-xs text-ink-400">
                <span>{revenueSeries[0]?.date ?? ""}</span>
                <span>
                  Completed services: {data.counts.completedServices}
                </span>
                <span>{revenueSeries[revenueSeries.length - 1]?.date ?? ""}</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your next appointments</CardTitle>
            </CardHeader>
            <CardContent>
              {(data.barber?.upcomingAppointments ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-500">Nothing booked yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {(data.barber?.upcomingAppointments ?? []).map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {appt.serviceSnapshot?.name ?? "Service"}
                        </p>
                        <p className="truncate text-xs text-ink-400">
                          {personName(appt.customer) || appt.guest?.name || "Client"}
                        </p>
                      </div>
                      <DateTime value={appt.startsAt} showTime className="text-xs" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {!isBarber && (
        <Card>
          <CardHeader>
            <CardTitle>Popular services</CardTitle>
          </CardHeader>
          <CardContent>
            {data.popularServices.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">
                No completed services in this period.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.popularServices.map((service) => (
                  <li key={service.name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <Scissors className="h-4 w-4 text-gold-dark" />
                      {service.name}
                    </span>
                    <Badge variant="gold">{service.count} bookings</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {!isBarber && upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell>
                      <DateTime value={appt.startsAt} showTime />
                    </TableCell>
                    <TableCell>{personName(appt.customer) || appt.guest?.name || "Walk-in"}</TableCell>
                    <TableCell>{appt.serviceSnapshot?.name ?? "—"}</TableCell>
                    <TableCell>{personName(appt.staff) || "Any"}</TableCell>
                    <TableCell>
                      <StatusBadge kind="booking" status={appt.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={appt.totalPrice} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
