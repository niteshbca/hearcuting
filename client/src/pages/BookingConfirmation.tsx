import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Mail,
  Phone,
  Settings2,
  UserRound,
} from "lucide-react";
import { apiGet, apiPost } from "@/services/api";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { AppointmentAllowedActions } from "@/types";
import { parseApiError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";

interface AppointmentContact {
  name?: string;
  email?: string;
  phone?: string;
}

interface PublicAppointment {
  reference: string;
  serviceSnapshot?: { name: string; category?: string; price: number; durationMinutes: number };
  date?: string;
  startsAt?: string;
  endsAt?: string;
  status: string;
  paymentStatus: string;
  totalPrice?: number;
  depositAmount?: number;
  guest?: AppointmentContact;
  customer?: AppointmentContact | string | null;
  staff?: { name?: string } | string | null;
  invoice?: string | null;
  notes?: string;
}

interface ManageResult {
  appointment: PublicAppointment;
  allowedActions: AppointmentAllowedActions;
}

interface PaymentInfo {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

function isManageResult(value: PublicAppointment | ManageResult): value is ManageResult {
  return typeof value === "object" && value !== null && "appointment" in value && "allowedActions" in value;
}

function contactOf(appointment: PublicAppointment): AppointmentContact {
  if (appointment.guest) return appointment.guest;
  if (appointment.customer && typeof appointment.customer === "object") return appointment.customer;
  return {};
}

function staffName(appointment: PublicAppointment): string {
  if (appointment.staff && typeof appointment.staff === "object") return appointment.staff.name ?? "Assigned barber";
  return "Assigned barber";
}

/* Minimal Razorpay typings for the checkout script. */
interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
}
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

let razorpayPromise: Promise<boolean> | null = null;
function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as { Razorpay?: unknown }).Razorpay) return Promise.resolve(true);
  if (razorpayPromise) return razorpayPromise;
  razorpayPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return razorpayPromise;
}

export default function BookingConfirmationPage() {
  usePageMeta("Booking Confirmation", "Your SalonPro appointment details.");

  const { reference = "" } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { settings } = usePublicSettings();
  const { user } = useAuth();
  const token = params.get("token") ?? "";
  const payment = (location.state as { payment?: PaymentInfo | null } | null)?.payment ?? null;

  const [paying, setPaying] = useState(false);

  const query = useQuery<PublicAppointment | ManageResult>({
    queryKey: ["booking", reference, token],
    queryFn: () =>
      token
        ? apiGet<ManageResult>(`/appointments/${reference}/manage`, { token })
        : apiGet<PublicAppointment>(`/appointments/${reference}`),
    enabled: Boolean(reference),
    retry: 1,
  });

  const data = query.data;
  const appointment = data ? (isManageResult(data) ? data.appointment : data) : null;
  const allowedActions = data && isManageResult(data) ? data.allowedActions : null;
  const contact = appointment ? contactOf(appointment) : {};

  async function handlePay() {
    if (!payment || !appointment) return;
    setPaying(true);
    try {
      const ready = await loadRazorpay();
      if (!ready) {
        toast.error("Payment is unavailable", { description: "Please refresh and try again." });
        return;
      }
      const Razorpay = (window as unknown as { Razorpay: RazorpayConstructor }).Razorpay;
      const checkout = new Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: settings.salonName || "SalonPro",
        description: `Booking ${appointment.reference}`,
        order_id: payment.orderId,
        prefill: { name: contact.name, email: contact.email, contact: contact.phone },
        theme: { color: "#C6A15B" },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (response) => {
          try {
            await apiPost("/payments/online/verify", {
              appointmentReference: appointment.reference,
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            toast.success("Payment received", { description: "Your booking is now paid." });
            void queryClient.invalidateQueries({ queryKey: ["booking", reference, token] });
          } catch (error) {
            const { message } = parseApiError(error);
            toast.error("Payment verification failed", { description: message });
          } finally {
            setPaying(false);
          }
        },
      });
      checkout.open();
    } catch (error) {
      const { message } = parseApiError(error);
      toast.error("Couldn't start payment", { description: message });
      setPaying(false);
    }
  }

  return (
    <div className="container-x max-w-3xl space-y-8 py-12">
      <PageHeader
        eyebrow="Booking"
        title={appointment ? "Your appointment" : "Booking details"}
        subtitle="Keep this page or your confirmation email handy for reference."
      />

      {query.isLoading ? (
        <LoadingState label="Loading your booking…" minHeight="16rem" />
      ) : query.isError || !appointment ? (
        <ErrorState
          title="Booking not found"
          message="We couldn't find this booking. Check your reference or the link in your confirmation email."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 bg-success-soft px-6 py-5 text-success">
              <CheckCircle2 className="h-8 w-8 shrink-0" />
              <div>
                <p className="font-display text-lg text-ink">
                  {appointment.status === "pending" ? "Booking received" : "Booking confirmed"}
                </p>
                <p className="text-sm text-ink-600">
                  {appointment.status === "pending"
                    ? "We'll confirm your appointment shortly."
                    : "We look forward to seeing you."}
                </p>
              </div>
            </div>

            <CardContent className="space-y-6 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">Booking reference</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-display text-2xl tracking-wide text-ink">{appointment.reference}</span>
                    <button
                      type="button"
                      aria-label="Copy reference"
                      onClick={() => {
                        void navigator.clipboard?.writeText(appointment.reference);
                        toast.success("Reference copied");
                      }}
                      className="rounded-sm p-1 text-ink-400 hover:text-gold-dark"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge kind="booking" status={appointment.status} />
                  <StatusBadge kind="payment" status={appointment.paymentStatus} />
                </div>
              </div>

              <div className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
                <Detail icon={CalendarDays} label="Date">
                  <DateTime value={appointment.startsAt ?? appointment.date} datePattern="EEEE, dd MMM yyyy" />
                </Detail>
                <Detail icon={Clock} label="Time">
                  <DateTime value={appointment.startsAt} showTime timePattern="hh:mm a" />
                </Detail>
                <Detail icon={BadgeCheck} label="Service">
                  {appointment.serviceSnapshot?.name ?? "Service"}
                </Detail>
                <Detail icon={UserRound} label="Barber">
                  {staffName(appointment)}
                </Detail>
              </div>

              {(contact.name || contact.email || contact.phone) && (
                <div className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
                  {contact.name && (
                    <Detail icon={UserRound} label="Name">
                      {contact.name}
                    </Detail>
                  )}
                  {contact.email && (
                    <Detail icon={Mail} label="Email">
                      {contact.email}
                    </Detail>
                  )}
                  {contact.phone && (
                    <Detail icon={Phone} label="Phone">
                      {contact.phone}
                    </Detail>
                  )}
                </div>
              )}

              {settings.payments.showPrices && typeof appointment.totalPrice === "number" && (
                <div className="flex items-center justify-between border-t border-border pt-6">
                  <span className="text-sm text-ink-500">Total</span>
                  <Money amount={appointment.totalPrice} currency={settings.currencySymbol} emphasis />
                </div>
              )}
            </CardContent>
          </Card>

          {payment && appointment.paymentStatus !== "paid" && (
            <Alert variant="info">
              <CreditCard />
              <AlertTitle>Deposit required</AlertTitle>
              <AlertDescription>
                <p>
                  A deposit of{" "}
                  <Money amount={payment.amount} currency={payment.currency === "INR" ? "₹" : payment.currency} /> is
                  required to secure this booking.
                </p>
                <Button
                  variant="gold"
                  size="sm"
                  className="mt-3"
                  onClick={() => void handlePay()}
                  disabled={paying}
                >
                  {paying ? "Opening checkout…" : "Pay deposit now"}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!payment && appointment.depositAmount && appointment.depositAmount > 0 && appointment.paymentStatus === "unpaid" && (
            <Alert variant="warning">
              <CreditCard />
              <AlertTitle>Deposit</AlertTitle>
              <AlertDescription>
                A deposit of{" "}
                <Money amount={appointment.depositAmount} currency={settings.currencySymbol} /> applies to this
                booking. Please contact us if you&apos;d like to pay ahead.
              </AlertDescription>
            </Alert>
          )}

          {appointment.notes && (
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-wide text-ink-400">Your notes</p>
                <p className="mt-1 text-sm text-ink-600">{appointment.notes}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            {token && (
              <Button asChild variant="outline">
                <Link to={`/booking/${appointment.reference}/manage?token=${encodeURIComponent(token)}`}>
                  <Settings2 className="h-4 w-4" /> Manage booking
                </Link>
              </Button>
            )}
            {appointment.invoice && user && (
              <Button asChild variant="outline">
                <Link to={`/dashboard/bookings/${appointment.reference}`}>View invoice</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/">Back to home</Link>
            </Button>
          </div>

          {allowedActions && (
            <p className="text-xs text-ink-400">
              {allowedActions.canReschedule
                ? `You can reschedule up to ${settings.booking.rescheduleCutoffHours}h before your appointment.`
                : "Rescheduling is no longer available for this booking."}
              {allowedActions.canCancel
                ? ` Cancellation available up to ${settings.booking.cancelCutoffHours}h before.`
                : " Cancellation is no longer available."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
        <p className="font-medium text-ink">{children}</p>
      </div>
    </div>
  );
}
