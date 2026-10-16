import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Wallet,
} from "lucide-react";
import { apiGet, apiGetList } from "@/services/api";
import type { AppointmentSnapshot, BookingStatus, PaymentStatus, User } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MineAppointment {
  id: string;
  reference: string;
  serviceSnapshot: AppointmentSnapshot;
  date: string;
  startsAt: string;
  staff: { id: string; name: string } | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalPrice: number;
  depositAmount: number;
}

interface CustomerSummaryResponse {
  stats: {
    totalVisits: number;
    totalSpent: number;
    noShowCount: number;
    lastVisitAt: string | null;
  };
  recentAppointments: MineAppointment[];
}

function isUpcoming(appointment: MineAppointment): boolean {
  const actionable = appointment.status === "pending" || appointment.status === "confirmed";
  return actionable && new Date(appointment.startsAt).getTime() >= Date.now();
}

export default function DashboardHomePage() {
  usePageMeta("My Dashboard", "Your upcoming visits and recent activity at a glance.");
  const { user: sessionUser } = useAuth();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<{ user: User }>("/auth/me"),
  });
  const user = meQuery.data?.user ?? sessionUser;

  const summaryQuery = useQuery({
    queryKey: ["customer", "summary"],
    queryFn: () => apiGet<CustomerSummaryResponse>("/customers/me/summary"),
    enabled: Boolean(user?.customerId),
  });

  const recentQuery = useQuery({
    queryKey: ["appointments", "mine", "recent"],
    queryFn: () =>
      apiGetList<MineAppointment>("/appointments/mine", { limit: 5, sort: "-startsAt" }),
  });

  const recent = recentQuery.data?.data ?? [];
  const stats = summaryQuery.data?.stats;
  const next = (summaryQuery.data?.recentAppointments ?? [])
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

  const statsLoading = summaryQuery.isLoading && Boolean(user?.customerId);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle={user ? `Signed in as ${user.email}` : undefined} />

      {statsLoading ? (
        <LoadingState label="Loading your overview…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Visits" value={stats?.totalVisits ?? 0} icon={CheckCircle2} accent="success" />
          <StatCard
            label="Total spent"
            value={<Money amount={stats?.totalSpent ?? 0} />}
            icon={Wallet}
            accent="ink"
          />
          <StatCard
            label="Last visit"
            value={stats?.lastVisitAt ? <DateTime value={stats.lastVisitAt} /> : "—"}
            icon={Clock}
            accent="gold"
          />
          <StatCard
            label="Upcoming"
            value={(summaryQuery.data?.recentAppointments ?? []).filter(isUpcoming).length}
            icon={CalendarClock}
            accent="gold"
          />
        </div>
      )}

      {next && (
        <Card className="overflow-hidden border-gold/30 bg-gradient-to-br from-gold-soft/60 to-white">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-dark">
                Next appointment
              </p>
              <p className="font-display text-xl text-ink">{next.serviceSnapshot.name}</p>
              <p className="text-sm text-ink-500">
                <DateTime value={next.startsAt} showTime />
                {next.staff ? ` · with ${next.staff.name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge kind="booking" status={next.status} />
              <Button asChild variant="gold" size="sm">
                <Link to={`/dashboard/bookings/${next.reference}`}>
                  View details <ArrowRight />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent bookings</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard/bookings">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-2">
          {recentQuery.isLoading ? (
            <LoadingState label="Loading bookings…" />
          ) : recentQuery.isError ? (
            <ErrorState
              title="Couldn't load bookings"
              message="We couldn't fetch your recent bookings."
              onRetry={() => recentQuery.refetch()}
            />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title="No bookings yet"
              description="Your appointments will show up here once you book one."
              action={
                <Button asChild variant="gold">
                  <Link to="/book">Book an appointment</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/dashboard/bookings/${appointment.reference}`}
                      className="font-medium text-ink transition-colors hover:text-gold-dark"
                    >
                      {appointment.serviceSnapshot.name}
                    </Link>
                    <p className="text-xs text-ink-500">
                      <DateTime value={appointment.startsAt} showTime />
                      {appointment.staff ? ` · ${appointment.staff.name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Money amount={appointment.totalPrice} emphasis />
                    <StatusBadge kind="booking" status={appointment.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
