import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGetList } from "@/services/api";
import type { Appointment } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatTime, parseApiError } from "@/lib/utils";

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function customerLabel(appointment: Appointment): string {
  if (appointment.customer && typeof appointment.customer === "object") {
    return appointment.customer.name;
  }
  return appointment.guest?.name ?? "Guest";
}

export default function StaffCalendarPage() {
  usePageMeta("Calendar", "Your week at a glance.");
  const [anchor, setAnchor] = useState(() => new Date());

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const from = dateKey(weekStart);
  const to = dateKey(addDays(weekStart, 6));
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const query = useQuery({
    queryKey: ["staff-calendar", from, to],
    queryFn: () => apiGetList<Appointment>("/appointments", { from, to, limit: 100, sort: "startsAt" }),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of query.data?.data ?? []) {
      const key = appointment.date?.slice(0, 10);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    return map;
  }, [query.data]);

  const todayKey = dateKey(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle={`Week of ${format(weekStart, "dd MMM yyyy")}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setAnchor(addWeeks(anchor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setAnchor(addWeeks(anchor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {query.isLoading ? (
        <LoadingState label="Loading calendar…" minHeight="20rem" />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load calendar"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {days.map((day) => {
            const key = dateKey(day);
            const items = byDate.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <Card key={key} className={cn("flex flex-col", isToday && "border-gold")}>
                <CardContent className="flex flex-1 flex-col gap-3 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-400">
                        {format(day, "EEE")}
                      </p>
                      <p className={cn("font-display text-lg", isToday ? "text-gold-dark" : "text-ink")}>
                        {format(day, "d")}
                      </p>
                    </div>
                    {items.length > 0 && (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">
                        {items.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    {items.length === 0 ? (
                      <p className="py-4 text-center text-xs text-ink-300">—</p>
                    ) : (
                      items.map((appointment) => (
                        <div
                          key={appointment.id}
                          className="rounded-md border border-border bg-cream/60 p-2 text-xs"
                        >
                          <p className="font-medium text-ink">{formatTime(appointment.startsAt)}</p>
                          <p className="truncate text-ink-600">{customerLabel(appointment)}</p>
                          <p className="truncate text-ink-400">
                            {appointment.serviceSnapshot?.name ?? ""}
                          </p>
                          <div className="mt-1">
                            <StatusBadge kind="booking" status={appointment.status} showDot={false} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!query.isLoading && !query.isError && (query.data?.data.length ?? 0) === 0 && (
        <div className="flex items-center justify-center gap-2 text-sm text-ink-500">
          <CalendarDays className="h-4 w-4" /> No appointments this week.
        </div>
      )}
    </div>
  );
}
