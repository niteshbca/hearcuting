import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { BadgeDollarSign, CalendarClock, Scissors, TrendingUp } from "lucide-react";
import { apiGet, apiGetList } from "@/services/api";
import type { StaffProfile } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Money } from "@/components/shared/Money";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DateRangePicker, type DateRangeValue } from "@/components/shared/DateRangePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseApiError } from "@/lib/utils";

interface Performance {
  staffId: string;
  period: { from: string; to: string };
  completedServices: number;
  revenue: number;
  commission: number;
  appointments: {
    completed: number;
    cancelled: number;
    noShow: number;
    upcoming: number;
  };
}

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export default function StaffPerformancePage() {
  usePageMeta("Performance", "Your completed services, revenue and commission.");
  const { user } = useAuth();

  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<DateRangeValue>({
    from: dateKey(addDays(today, -30)),
    to: dateKey(today),
  });
  const [selectedStaff, setSelectedStaff] = useState<string>("");

  const staffQuery = useQuery({
    queryKey: ["staff", "performance-picker"],
    queryFn: () => apiGetList<StaffProfile>("/staff", { limit: 100, sort: "name" }),
    enabled: !user?.staffId,
  });

  const staffId = user?.staffId ?? selectedStaff;

  const query = useQuery({
    queryKey: ["staff-performance", staffId, range],
    queryFn: () =>
      apiGet<Performance>(`/staff/${staffId}/performance`, {
        from: range.from,
        to: range.to,
      }),
    enabled: Boolean(staffId),
  });

  const performance = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        subtitle="Completed services, revenue and commission for the selected period."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {!user?.staffId ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-ink" htmlFor="perf-staff">
              Staff member
            </label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger id="perf-staff" className="w-64">
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {(staffQuery.data?.data ?? []).map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div />
        )}
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {!staffId ? (
        <ErrorState title="Select a staff member" message="Choose a staff member to view their performance." />
      ) : query.isLoading ? (
        <LoadingState label="Loading performance…" minHeight="16rem" />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load performance"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : performance ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue"
              value={<Money amount={performance.revenue} />}
              icon={TrendingUp}
            />
            <StatCard
              label="Commission"
              value={<Money amount={performance.commission} />}
              icon={BadgeDollarSign}
              accent="success"
            />
            <StatCard
              label="Completed services"
              value={performance.completedServices}
              icon={Scissors}
              accent="ink"
            />
            <StatCard
              label="Upcoming"
              value={performance.appointments.upcoming}
              icon={CalendarClock}
              accent="gold"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-400">Completed</p>
                <p className="font-display text-xl text-ink">{performance.appointments.completed}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-400">Cancelled</p>
                <p className="font-display text-xl text-ink">{performance.appointments.cancelled}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-400">No show</p>
                <p className="font-display text-xl text-ink">{performance.appointments.noShow}</p>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-ink-400">
            Period: {format(new Date(performance.period.from), "dd MMM yyyy")} –{" "}
            {format(new Date(performance.period.to), "dd MMM yyyy")}
          </p>
        </>
      ) : null}
    </div>
  );
}
