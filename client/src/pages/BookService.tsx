import { useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarDays, Clock, Lock, Scissors, UserRound } from "lucide-react";
import { apiPost } from "@/services/api";
import { usePublicServices, usePublicSettings } from "@/hooks/usePublicSettings";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { BookingResult } from "@/types";
import { parseApiError, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Money } from "@/components/shared/Money";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number"),
  notes: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function BookServicePage() {
  usePageMeta("Confirm Booking", "Confirm your appointment details at SalonPro.");

  const { serviceId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = usePublicSettings();
  const servicesQuery = usePublicServices();

  const date = params.get("date") ?? "";
  const time = params.get("time") ?? "";
  const staffId = params.get("staffId") ?? "any";

  const service = servicesQuery.data?.find((s) => s.id === serviceId) ?? null;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", notes: "" },
  });

  useEffect(() => {
    if (!user) return;
    reset({
      name: user.name ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      notes: "",
    });
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiPost<BookingResult>("/appointments", {
        serviceId,
        staffId: staffId || "any",
        date,
        time,
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        notes: values.notes?.trim() ? values.notes.trim() : undefined,
        guest: !user,
      }),
    onSuccess: (result) => {
      toast.success("Booking received!", {
        description: `Your reference is ${result.bookingReference}.`,
      });
      const token = result.managementToken;
      const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
      navigate(`/booking/${result.bookingReference}${suffix}`, {
        state: { payment: result.payment ?? null },
      });
    },
    onError: (error) => {
      const { message } = parseApiError(error);
      toast.error("Couldn't complete your booking", { description: message });
    },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  const missingSelection = !serviceId || !date || !time;

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="Almost there"
        title="Confirm your booking"
        subtitle="Share a few details and we'll reserve your spot."
      />

      {missingSelection ? (
        <ErrorState
          title="Missing booking details"
          message="We need a service, date and time to continue. Please start again."
          onRetry={() => navigate("/book")}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardContent className="space-y-5 p-6">
              <h2 className="flex items-center gap-2 font-display text-lg text-ink">
                <UserRound className="h-5 w-5 text-gold-dark" /> Your details
              </h2>

              {!user && settings.booking.allowGuest && (
                <p className="flex items-center gap-2 rounded-md bg-cream px-3 py-2 text-xs text-ink-500">
                  <Lock className="h-3.5 w-3.5 text-gold-dark" />
                  Booking as a guest — no account required.
                </p>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                <FormField
                  control={control}
                  name="name"
                  label="Full name"
                  required
                  render={(field) => (
                    <Input
                      id="name"
                      placeholder="Your name"
                      autoComplete="name"
                      value={String(field.value ?? "")}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={control}
                    name="email"
                    label="Email"
                    required
                    render={(field) => (
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={String(field.value ?? "")}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    )}
                  />
                  <FormField
                    control={control}
                    name="phone"
                    label="Phone"
                    required
                    render={(field) => (
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        autoComplete="tel"
                        value={String(field.value ?? "")}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    )}
                  />
                </div>
                <FormField
                  control={control}
                  name="notes"
                  label="Notes"
                  description="Anything we should know? Allergies, style references, etc."
                  render={(field) => (
                    <Textarea
                      id="notes"
                      rows={4}
                      placeholder="Optional"
                      value={String(field.value ?? "")}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />

                <Button
                  type="submit"
                  variant="gold"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting || mutation.isPending}
                >
                  {mutation.isPending ? "Confirming…" : "Confirm booking"}
                </Button>
                <p className="text-center text-xs text-ink-400">
                  By confirming you agree to our{" "}
                  <Link to="/terms" className="text-gold-dark hover:underline">terms</Link> and{" "}
                  <Link to="/cancellation-policy" className="text-gold-dark hover:underline">
                    cancellation policy
                  </Link>
                  .
                </p>
              </form>
            </CardContent>
          </Card>

          <div>
            <Card className="lg:sticky lg:top-24">
              <CardContent className="space-y-4 p-6">
                <h2 className="font-display text-lg text-ink">Booking summary</h2>
                {servicesQuery.isLoading ? (
                  <LoadingState label="Loading details…" minHeight="6rem" />
                ) : (
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink-400">Service</dt>
                        <dd className="font-medium text-ink">{service?.name ?? "Selected service"}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink-400">Date</dt>
                        <dd className="font-medium text-ink">
                          {formatDate(`${date}T00:00:00`, "EEEE, dd MMM yyyy")}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink-400">Time</dt>
                        <dd className="font-medium text-ink">{time}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink-400">Barber</dt>
                        <dd className="font-medium text-ink">
                          {staffId === "any" ? "Any available" : "Selected barber"}
                        </dd>
                      </div>
                    </div>
                  </dl>
                )}

                {service && settings.payments.showPrices && (
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="text-sm text-ink-500">Estimated total</span>
                    <Money amount={service.discountPrice ?? service.price} currency={settings.currencySymbol} emphasis />
                  </div>
                )}

                {settings.booking.requireDeposit && (
                  <Badge variant="warning" className="w-full justify-center py-1.5">
                    A {settings.booking.depositPercent}% deposit may be required
                  </Badge>
                )}

                <Button asChild variant="ghost" size="sm" className="w-full">
                  <Link to={`/book?serviceId=${serviceId}`}>Change selection</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
