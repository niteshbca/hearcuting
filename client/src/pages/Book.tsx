import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { CalendarDays, Clock, Scissors, Users } from "lucide-react";
import { apiGet } from "@/services/api";
import { usePublicServices, usePublicSettings, usePublicStaff } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { AvailabilitySlotsResult, BookingSlot } from "@/types";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Money } from "@/components/shared/Money";

const ANY = "any";

export default function BookPage() {
  usePageMeta("Book an Appointment", "Choose your service, barber and time at SalonPro.");

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { settings } = usePublicSettings();
  const servicesQuery = usePublicServices();
  const staffQuery = usePublicStaff();

  const services = servicesQuery.data ?? [];
  const staff = staffQuery.data ?? [];

  const today = format(new Date(), "yyyy-MM-dd");
  const maxDate = format(addDays(new Date(), settings.booking.maxAdvanceDays), "yyyy-MM-dd");

  const [serviceId, setServiceId] = useState(params.get("serviceId") ?? "");
  const [date, setDate] = useState(params.get("date") ?? today);
  const [staffId, setStaffId] = useState(params.get("staffId") ?? ANY);
  const [search, setSearch] = useState("");

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const filteredServices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return services;
    return services.filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(term));
  }, [services, search]);

  const slotsQuery = useQuery<AvailabilitySlotsResult>({
    queryKey: ["availability", serviceId, date, staffId],
    queryFn: () =>
      apiGet<AvailabilitySlotsResult>("/availability/slots", {
        serviceId,
        date,
        staffId: staffId || ANY,
      }),
    enabled: Boolean(serviceId && date),
    staleTime: 30 * 1000,
    retry: 0,
  });

  function goToService(slot: BookingSlot) {
    const query = new URLSearchParams({
      date,
      time: slot.time,
      staffId: staffId || ANY,
    });
    navigate(`/book/${serviceId}?${query.toString()}`);
  }

  const slots = slotsQuery.data?.slots ?? [];
  const noOpenSlots = slotsQuery.isSuccess && slots.length === 0;

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="Booking"
        title="Book an appointment"
        subtitle="Pick a service, choose a date and claim a time that works for you."
        actions={
          settings.booking.allowGuest ? <Badge variant="success">No account needed</Badge> : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-lg text-ink">
                  <Scissors className="h-5 w-5 text-gold-dark" /> 1. Choose a service
                </h2>
                {services.length > 4 && (
                  <SearchInput value={search} onChange={setSearch} placeholder="Search…" className="w-44" />
                )}
              </div>

              {servicesQuery.isLoading ? (
                <LoadingState label="Loading services…" minHeight="6rem" />
              ) : servicesQuery.isError ? (
                <ErrorState message="Couldn't load services." onRetry={() => void servicesQuery.refetch()} />
              ) : filteredServices.length === 0 ? (
                <p className="text-sm text-ink-500">No services match your search.</p>
              ) : (
                <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                  {filteredServices.map((service) => {
                    const active = service.id === serviceId;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => setServiceId(service.id)}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-gold bg-gold-soft/60"
                            : "border-border hover:border-gold/60 hover:bg-cream/60",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{service.name}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-400">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {service.durationMinutes} min
                            </span>
                            <span>· {service.category}</span>
                          </span>
                        </span>
                        {settings.payments.showPrices && (
                          <Money
                            amount={service.discountPrice ?? service.price}
                            currency={settings.currencySymbol}
                            className="shrink-0 text-sm font-medium text-ink"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-6">
              <h2 className="flex items-center gap-2 font-display text-lg text-ink">
                <CalendarDays className="h-5 w-5 text-gold-dark" /> 2. Date &amp; barber
              </h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="date">Date</Label>
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
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="lg:sticky lg:top-24">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg text-ink">
                  <Clock className="h-5 w-5 text-gold-dark" /> 3. Pick a time
                </h2>
                {selectedService && (
                  <Badge variant="outline">{selectedService.durationMinutes} min</Badge>
                )}
              </div>

              {!serviceId ? (
                <p className="rounded-md border border-dashed border-border bg-cream/40 px-4 py-8 text-center text-sm text-ink-500">
                  Select a service to see available times.
                </p>
              ) : !date ? (
                <p className="rounded-md border border-dashed border-border bg-cream/40 px-4 py-8 text-center text-sm text-ink-500">
                  Choose a date to see available times.
                </p>
              ) : slotsQuery.isLoading ? (
                <LoadingState label="Finding open slots…" minHeight="8rem" />
              ) : slotsQuery.isError ? (
                <ErrorState
                  title="Slots unavailable"
                  message="We couldn't load times for this selection. Try another date or barber."
                  onRetry={() => void slotsQuery.refetch()}
                />
              ) : noOpenSlots ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No open times"
                  description={
                    slotsQuery.data?.reason === "no_eligible_staff"
                      ? "No barber offers this service. Please try another service."
                      : "Try a different date or choose a different barber."
                  }
                  className="py-10"
                />
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> {format(new Date(`${date}T00:00:00`), "EEE, dd MMM yyyy")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {staffId === ANY ? "Any barber" : staff.find((s) => s.id === staffId)?.name ?? "Barber"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => goToService(slot)}
                        className="rounded-md border border-border px-2 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-gold-soft/60 hover:text-gold-dark"
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                  <p className="text-center text-xs text-ink-400">
                    Times are shown in {settings.timezone}.
                  </p>
                </>
              )}

              {selectedService && (
                <div className="rounded-md bg-ink px-4 py-3 text-white">
                  <p className="text-xs uppercase tracking-wide text-white/50">Selected</p>
                  <p className="mt-0.5 font-medium">{selectedService.name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
