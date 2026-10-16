import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { CalendarDays, CalendarX, Clock, RotateCcw, TriangleAlert, UserRound } from "lucide-react";
import { apiGet, apiPost } from "@/services/api";
import { usePublicSettings, usePublicStaff } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { AvailabilitySlotsResult, AppointmentAllowedActions } from "@/types";
import { parseApiError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateTime } from "@/components/shared/DateTime";

const ANY = "any";

interface PublicAppointment {
  reference: string;
  service?: string | { id?: string };
  serviceSnapshot?: { name: string; category?: string; price: number; durationMinutes: number };
  date?: string;
  startsAt?: string;
  status: string;
  paymentStatus: string;
  staff?: { id?: string; name?: string } | string | null;
  guest?: { name?: string; email?: string; phone?: string };
  customer?: { name?: string; email?: string; phone?: string } | string | null;
}

interface ManageResult {
  appointment: PublicAppointment;
  allowedActions: AppointmentAllowedActions;
}

function serviceIdOf(appointment: PublicAppointment): string {
  if (typeof appointment.service === "string") return appointment.service;
  return appointment.service?.id ?? "";
}

function staffIdOf(appointment: PublicAppointment): string {
  if (appointment.staff && typeof appointment.staff === "object") return appointment.staff.id ?? "";
  return "";
}

function staffNameOf(appointment: PublicAppointment): string {
  if (appointment.staff && typeof appointment.staff === "object") return appointment.staff.name ?? "Assigned barber";
  return "Assigned barber";
}

export default function GuestManagePage() {
  usePageMeta("Manage Your Booking", "Reschedule or cancel your SalonPro appointment without an account.");

  const { reference = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { settings } = usePublicSettings();
  const staffQuery = usePublicStaff();
  const staff = staffQuery.data ?? [];

  const today = format(new Date(), "yyyy-MM-dd");
  const maxDate = format(addDays(new Date(), settings.booking.maxAdvanceDays), "yyyy-MM-dd");

  const [date, setDate] = useState("");
  const [staffId, setStaffId] = useState(ANY);
  const [reason, setReason] = useState("");
  const [initialised, setInitialised] = useState(false);

  const query = useQuery<ManageResult>({
    queryKey: ["booking-manage", reference, token],
    queryFn: () => apiGet<ManageResult>(`/appointments/${reference}/manage`, { token }),
    enabled: Boolean(reference && token),
    retry: 1,
  });

  const appointment = query.data?.appointment ?? null;
  const allowed = query.data?.allowedActions ?? null;
  const serviceId = appointment ? serviceIdOf(appointment) : "";

  useEffect(() => {
    if (!appointment || initialised) return;
    setDate(appointment.date ?? today);
    setStaffId(staffIdOf(appointment) || ANY);
    setInitialised(true);
  }, [appointment, initialised, today]);

  const slotsQuery = useQuery<AvailabilitySlotsResult>({
    queryKey: ["manage-slots", serviceId, date, staffId],
    queryFn: () =>
      apiGet<AvailabilitySlotsResult>("/availability/slots", {
        serviceId,
        date,
        staffId: staffId || ANY,
      }),
    enabled: Boolean(allowed?.canReschedule && serviceId && date),
    staleTime: 30 * 1000,
    retry: 0,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["booking-manage", reference, token] });

  const reschedule = useMutation({
    mutationFn: (slot: { time: string }) =>
      apiPost(`/appointments/${reference}/reschedule`, {
        token,
        date,
        time: slot.time,
        staffId: staffId && staffId !== ANY ? staffId : undefined,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Booking rescheduled", { description: "We've emailed you the updated details." });
      setReason("");
      void refresh();
    },
    onError: (error) => {
      const { message } = parseApiError(error);
      toast.error("Couldn't reschedule", { description: message });
    },
  });

  const cancel = useMutation({
    mutationFn: () =>
      apiPost(`/appointments/${reference}/cancel`, {
        token,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Booking cancelled");
      setReason("");
      void refresh();
    },
    onError: (error) => {
      const { message } = parseApiError(error);
      toast.error("Couldn't cancel", { description: message });
    },
  });

  async function handleSlot(slot: { time: string }) {
    const ok = await confirm({
      title: "Reschedule appointment?",
      description: `Move your appointment to ${slot.time} on ${format(new Date(`${date}T00:00:00`), "dd MMM yyyy")}.`,
      confirmText: "Reschedule",
    });
    if (ok) reschedule.mutate(slot);
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel this booking?",
      description: "This will release your time slot. This action cannot be undone.",
      confirmText: "Yes, cancel",
      destructive: true,
    });
    if (ok) cancel.mutate();
  }

  const slots = slotsQuery.data?.slots ?? [];

  return (
    <div className="container-x max-w-3xl space-y-8 py-12">
      <PageHeader
        eyebrow="Manage"
        title="Manage your booking"
        subtitle="Reschedule or cancel your appointment using your secure management link."
      />

      {!token ? (
        <ErrorState
          title="Management link required"
          message="This page needs the secure link from your confirmation email. Please use the link we sent you."
        />
      ) : query.isLoading ? (
        <LoadingState label="Loading your booking…" minHeight="14rem" />
      ) : query.isError || !appointment ? (
        <ErrorState
          title="Booking not found"
          message="This management link is invalid or has expired."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">Booking reference</p>
                  <p className="font-display text-2xl tracking-wide text-ink">{appointment.reference}</p>
                </div>
                <StatusBadge kind="booking" status={appointment.status} />
              </div>
              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">Service</p>
                  <p className="font-medium text-ink">{appointment.serviceSnapshot?.name ?? "Service"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">Date</p>
                  <p className="font-medium text-ink">
                    <DateTime value={appointment.startsAt ?? appointment.date} datePattern="dd MMM yyyy" />
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">Time</p>
                  <p className="font-medium text-ink">
                    <DateTime value={appointment.startsAt} showTime timePattern="hh:mm a" />
                  </p>
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm text-ink-500">
                <UserRound className="h-4 w-4 text-gold-dark" /> {staffNameOf(appointment)}
              </p>
            </CardContent>
          </Card>

          {!allowed?.canReschedule && !allowed?.canCancel && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>Changes unavailable</AlertTitle>
              <AlertDescription>
                This booking can no longer be rescheduled or cancelled online. Please contact the salon for help.
              </AlertDescription>
            </Alert>
          )}

          {allowed?.canReschedule && (
            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="flex items-center gap-2 font-display text-lg text-ink">
                  <RotateCcw className="h-5 w-5 text-gold-dark" /> Reschedule
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="date">New date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      min={today}
                      max={maxDate}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="staff">Barber</Label>
                    <Select value={staffId} onValueChange={setStaffId}>
                      <SelectTrigger id="staff">
                        <SelectValue placeholder="Any available" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>Any available</SelectItem>
                        {staff.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {slotsQuery.isLoading ? (
                  <LoadingState label="Finding open times…" minHeight="6rem" />
                ) : slotsQuery.isError ? (
                  <ErrorState message="Couldn't load available times." onRetry={() => void slotsQuery.refetch()} />
                ) : slots.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No open times"
                    description="Try a different date or choose a different barber."
                    className="py-8"
                  />
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={reschedule.isPending}
                        onClick={() => void handleSlot(slot)}
                        className="rounded-md border border-border px-2 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-gold-soft/60 hover:text-gold-dark disabled:opacity-50"
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Textarea
                    id="reason"
                    rows={2}
                    placeholder="Let us know why you're rescheduling"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {allowed?.canCancel && (
            <Card className="border-danger/30">
              <CardContent className="space-y-4 p-6">
                <h2 className="flex items-center gap-2 font-display text-lg text-ink">
                  <CalendarX className="h-5 w-5 text-danger" /> Cancel booking
                </h2>
                <p className="text-sm text-ink-500">
                  Cancelling releases your slot immediately. This cannot be undone.
                </p>
                <div className="grid gap-1.5">
                  <Label htmlFor="cancel-reason">Reason (optional)</Label>
                  <Textarea
                    id="cancel-reason"
                    rows={2}
                    placeholder="Tell us why you're cancelling"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  className="border-danger/40 text-danger hover:border-danger hover:bg-danger-soft"
                  onClick={() => void handleCancel()}
                  disabled={cancel.isPending}
                >
                  <CalendarX className="h-4 w-4" />
                  {cancel.isPending ? "Cancelling…" : "Cancel appointment"}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2 text-sm text-ink-400">
            <Clock className="h-4 w-4" />
            <span>
              Reschedule up to {settings.booking.rescheduleCutoffHours}h and cancel up to{" "}
              {settings.booking.cancelCutoffHours}h before your appointment.
            </span>
          </div>

          <div>
            <Button asChild variant="ghost">
              <Link to={`/booking/${appointment.reference}?token=${encodeURIComponent(token)}`}>
                View booking details
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
