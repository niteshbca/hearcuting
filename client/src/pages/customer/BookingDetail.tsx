import { useState, type ComponentType, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CreditCard,
  RefreshCw,
  Scissors,
  Ticket,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/services/api";
import {
  entityId,
  personName,
  type Appointment,
  type AvailabilitySlotsResult,
  type Invoice,
  type Payment,
} from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

interface DetailItemProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  hint?: string;
}

function DetailItem({ icon: Icon, label, value, hint }: DetailItemProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-soft text-gold-dark">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-ink-400">{label}</dt>
        <dd className="font-medium text-ink">{value}</dd>
        {hint && <p className="text-xs text-ink-400">{hint}</p>}
      </div>
    </div>
  );
}

export default function DashboardBookingDetailPage() {
  const { reference = "" } = useParams<{ reference: string }>();
  usePageMeta("Booking Details", "Review, reschedule or cancel your appointment.");
  const { settings } = usePublicSettings();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [date, setDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const query = useQuery({
    queryKey: ["appointment", reference],
    queryFn: () => apiGet<Appointment>(`/appointments/${reference}`),
    enabled: Boolean(reference),
  });
  const appointment = query.data;

  const invoiceId = appointment?.invoice;
  const invoiceQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiGet<{ invoice: Invoice; payments: Payment[] }>(`/invoices/${invoiceId}`),
    enabled: Boolean(invoiceId),
  });

  const serviceId = typeof appointment?.service === "string" ? appointment.service : "";
  const staffId = appointment ? entityId(appointment.staff) : "";

  const slotsQuery = useQuery({
    queryKey: ["slots", serviceId, date, staffId],
    queryFn: () =>
      apiGet<AvailabilitySlotsResult>("/availability/slots", {
        serviceId,
        date,
        staffId: staffId || undefined,
      }),
    enabled: rescheduleOpen && Boolean(serviceId) && Boolean(date),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["appointment", reference] });
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["customer", "summary"] });
  }

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiPost<{ appointment: Appointment }>(`/appointments/${reference}/cancel`, {}),
    onSuccess: () => {
      toast.success("Booking cancelled");
      invalidate();
    },
    onError: (error) =>
      toast.error("Couldn't cancel booking", { description: parseApiError(error).message }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: () =>
      apiPost<{ appointment: Appointment }>(`/appointments/${reference}/reschedule`, {
        date,
        time: selectedTime,
        staffId: staffId || undefined,
      }),
    onSuccess: () => {
      toast.success("Booking rescheduled");
      setRescheduleOpen(false);
      setDate("");
      setSelectedTime("");
      invalidate();
    },
    onError: (error) =>
      toast.error("Couldn't reschedule booking", { description: parseApiError(error).message }),
  });

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel this booking?",
      description: "Your slot will be released. This cannot be undone.",
      confirmText: "Cancel booking",
      cancelText: "Keep it",
      destructive: true,
    });
    if (ok) cancelMutation.mutate();
  }

  if (query.isLoading) {
    return <LoadingState label="Loading booking…" minHeight="16rem" />;
  }

  if (query.isError || !appointment) {
    return (
      <ErrorState
        title="Booking not found"
        message={
          query.isError
            ? parseApiError(query.error).message
            : "We couldn't find this booking."
        }
        onRetry={() => query.refetch()}
      />
    );
  }

  const minsLeft = (new Date(appointment.startsAt).getTime() - Date.now()) / 60000;
  const actionable = appointment.status === "pending" || appointment.status === "confirmed";
  const canReschedule = actionable && minsLeft >= settings.booking.rescheduleCutoffHours * 60;
  const canCancel = actionable && minsLeft >= settings.booking.cancelCutoffHours * 60;
  const today = new Date().toISOString().slice(0, 10);
  const slots = slotsQuery.data?.slots ?? [];

  return (
    <div className="space-y-6">
      <div className="-mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard/bookings">
            <ArrowLeft /> My bookings
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Booking ${appointment.reference}`}
        subtitle={appointment.serviceSnapshot.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canReschedule && (
              <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(true)}>
                <RefreshCw /> Reschedule
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                className="text-danger hover:text-danger"
                disabled={cancelMutation.isPending}
                onClick={handleCancel}
              >
                <XCircle /> Cancel
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-gold-dark" /> Appointment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="booking" status={appointment.status} />
            <StatusBadge kind="payment" status={appointment.paymentStatus} />
            <Badge variant="outline" className="capitalize">
              {appointment.source.replace("_", " ")}
            </Badge>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailItem
              icon={Scissors}
              label="Service"
              value={appointment.serviceSnapshot.name}
              hint={`${appointment.serviceSnapshot.durationMinutes} minutes`}
            />
            <DetailItem
              icon={CalendarClock}
              label="Date & time"
              value={<DateTime value={appointment.startsAt} showTime />}
            />
            <DetailItem
              icon={UserIcon}
              label="Staff"
              value={personName(appointment.staff) || "Any available"}
            />
            <DetailItem
              icon={CreditCard}
              label="Total"
              value={<Money amount={appointment.totalPrice} emphasis />}
              hint={
                appointment.depositAmount > 0 ? "A deposit may be required" : "No deposit required"
              }
            />
          </dl>

          {(appointment.notes || appointment.serviceNotes) && (
            <div className="space-y-2 rounded-md border border-border bg-cream/50 p-4 text-sm">
              {appointment.notes && (
                <p className="text-ink-700">
                  <span className="font-medium">Your notes: </span>
                  {appointment.notes}
                </p>
              )}
              {appointment.serviceNotes && (
                <p className="text-ink-700">
                  <span className="font-medium">Service notes: </span>
                  {appointment.serviceNotes}
                </p>
              )}
            </div>
          )}

          {!actionable && (
            <p className="text-sm text-ink-500">
              This booking is {appointment.status.replace("_", " ")} and can no longer be changed
              online. Please contact the salon if you need help.
            </p>
          )}
          {actionable && !canReschedule && !canCancel && (
            <p className="text-sm text-ink-500">
              Changes are no longer available within the salon's cut-off window. Please contact the
              salon directly.
            </p>
          )}
        </CardContent>
      </Card>

      {invoiceId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-gold-dark" /> Invoice
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoiceQuery.isLoading ? (
              <LoadingState label="Loading invoice…" minHeight="6rem" />
            ) : invoiceQuery.isError ? (
              <ErrorState
                title="Couldn't load invoice"
                message={parseApiError(invoiceQuery.error).message}
                onRetry={() => invoiceQuery.refetch()}
              />
            ) : invoiceQuery.data ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-ink">
                    {invoiceQuery.data.invoice.invoiceNumber}
                  </span>
                  <StatusBadge kind="invoice" status={invoiceQuery.data.invoice.status} />
                </div>
                <Separator />
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-ink-400">Total</dt>
                    <dd>
                      <Money amount={invoiceQuery.data.invoice.total} emphasis />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Paid</dt>
                    <dd>
                      <Money amount={invoiceQuery.data.invoice.amountPaid} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Balance</dt>
                    <dd>
                      <Money amount={invoiceQuery.data.invoice.balanceDue} emphasis />
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {appointment.rescheduleHistory && appointment.rescheduleHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reschedule history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {appointment.rescheduleHistory.map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="text-ink-500">
                    <DateTime value={entry.fromStart} showTime /> {"→"}{" "}
                    <DateTime value={entry.toStart} showTime />
                  </span>
                  <span className="text-xs text-ink-400">
                    <DateTime value={entry.at} showTime />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) {
            setDate("");
            setSelectedTime("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule booking</DialogTitle>
            <DialogDescription>
              Pick a new date and time for {appointment.serviceSnapshot.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="reschedule-date">New date</Label>
              <Input
                id="reschedule-date"
                type="date"
                min={today}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedTime("");
                }}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Available times</Label>
              {!date ? (
                <p className="text-sm text-ink-400">Choose a date to see available times.</p>
              ) : slotsQuery.isLoading ? (
                <LoadingState label="Checking availability…" minHeight="6rem" />
              ) : slotsQuery.isError ? (
                <ErrorState
                  title="Couldn't load times"
                  message={parseApiError(slotsQuery.error).message}
                  onRetry={() => slotsQuery.refetch()}
                />
              ) : slots.length === 0 ? (
                <p className="text-sm text-ink-400">
                  No times available on this date. Try another day.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <Button
                      key={slot.time}
                      type="button"
                      size="sm"
                      variant={selectedTime === slot.time ? "default" : "outline"}
                      onClick={() => setSelectedTime(slot.time)}
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>
              Close
            </Button>
            <Button
              variant="gold"
              disabled={!selectedTime || rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
            >
              {rescheduleMutation.isPending ? "Rescheduling…" : "Confirm new time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
