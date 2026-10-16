import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { apiGet, apiGetList, apiPatch } from "@/services/api";
import type { Appointment } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DateTime } from "@/components/shared/DateTime";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
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
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show", "completed"],
  in_progress: ["completed", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const BARBER_ALLOWED = ["in_progress", "completed", "no_show"];

const ACTION_LABELS: Record<string, string> = {
  confirmed: "Confirm",
  in_progress: "Start",
  completed: "Complete",
  cancelled: "Cancel",
  no_show: "No show",
};

interface StaffDay {
  staffId: string;
  date: string;
  windows: Array<{ start: string; end: string }>;
  appointments: unknown[];
}

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function customerLabel(appointment: Appointment): string {
  if (appointment.customer && typeof appointment.customer === "object") {
    return appointment.customer.name;
  }
  return appointment.guest?.name ?? "—";
}

export default function StaffTodayPage() {
  usePageMeta("Today", "Your appointments and schedule for today.");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = useMemo(todayKey, []);
  const isBarber = user?.role === "barber";

  const appointmentsQuery = useQuery({
    queryKey: ["staff-today", user?.staffId ?? "all", today],
    queryFn: () =>
      apiGetList<Appointment>("/appointments", {
        from: today,
        to: today,
        limit: 100,
        sort: "startsAt",
        staffId: user?.staffId,
      }),
  });

  const staffDayQuery = useQuery({
    queryKey: ["staff-day", user?.staffId, today],
    queryFn: () => apiGet<StaffDay>("/availability/staff-day", { date: today, staffId: user?.staffId }),
    enabled: Boolean(user?.staffId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/appointments/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Appointment updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-today"] });
    },
    onError: (error) =>
      toast.error("Couldn't update appointment", { description: parseApiError(error).message }),
  });

  const appointments = appointmentsQuery.data?.data ?? [];
  const completed = appointments.filter((a) => a.status === "completed").length;
  const upcoming = appointments.filter((a) =>
    ["pending", "confirmed", "in_progress"].includes(a.status),
  ).length;

  function allowedActions(appointment: Appointment): string[] {
    const next = STATUS_TRANSITIONS[appointment.status] ?? [];
    return isBarber ? next.filter((s) => BARBER_ALLOWED.includes(s)) : next;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Appointments today" value={appointments.length} icon={CalendarCheck} />
        <StatCard label="Upcoming" value={upcoming} icon={Clock} accent="ink" />
        <StatCard label="Completed" value={completed} icon={CheckCircle2} accent="success" />
      </div>

      {user?.staffId && (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CalendarClock className="h-4 w-4 text-gold-dark" />
            <CardTitle>Your working hours</CardTitle>
          </CardHeader>
          <CardContent>
            {staffDayQuery.isLoading ? (
              <p className="text-sm text-ink-500">Loading…</p>
            ) : staffDayQuery.isError ? (
              <p className="text-sm text-ink-500">Schedule unavailable.</p>
            ) : staffDayQuery.data && staffDayQuery.data.windows.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {staffDayQuery.data.windows.map((window, index) => (
                  <span
                    key={index}
                    className="rounded-full bg-gold-soft px-3 py-1 text-sm font-medium text-gold-dark"
                  >
                    {window.start} – {window.end}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No working hours scheduled today.</p>
            )}
          </CardContent>
        </Card>
      )}

      {appointmentsQuery.isLoading ? (
        <DataTableSkeleton rows={6} columns={5} />
      ) : appointmentsQuery.isError ? (
        <ErrorState
          title="Couldn't load appointments"
          message={parseApiError(appointmentsQuery.error).message}
          onRetry={() => appointmentsQuery.refetch()}
        />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No appointments today"
          description="Enjoy the quiet — bookings for today will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appointment) => {
                  const actions = allowedActions(appointment);
                  return (
                    <TableRow key={appointment.id}>
                      <TableCell className="whitespace-nowrap font-medium text-ink">
                        <DateTime value={appointment.startsAt} showTime />
                      </TableCell>
                      <TableCell className="text-ink">{customerLabel(appointment)}</TableCell>
                      <TableCell className="text-ink-500">
                        {appointment.serviceSnapshot?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="booking" status={appointment.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {actions.length === 0 ? (
                            <span className="text-xs text-ink-400">—</span>
                          ) : (
                            actions.map((status) => (
                              <Button
                                key={status}
                                variant={status === "completed" ? "gold" : "outline"}
                                size="sm"
                                disabled={statusMutation.isPending}
                                onClick={() => statusMutation.mutate({ id: appointment.id, status })}
                              >
                                {ACTION_LABELS[status] ?? status}
                              </Button>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
