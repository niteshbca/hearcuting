import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  MapPin,
  Phone,
  Scissors,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { apiGet } from "@/services/api";
import { usePublicServices, usePublicSettings, usePublicStaff } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { Review, StaffProfile } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { Money } from "@/components/shared/Money";
import { LoadingState } from "@/components/shared/LoadingState";
import { cn } from "@/lib/utils";

function tone(index: number): "gold" | "ink" | "success" {
  return (["gold", "ink", "success"] as const)[index % 3];
}

function StaffServices({ staff }: { staff: StaffProfile }) {
  const names = (staff.services ?? [])
    .map((s) => (typeof s === "string" ? "" : s.name))
    .filter((name): name is string => Boolean(name))
    .slice(0, 3);
  if (!names.length) return null;
  return <p className="text-xs text-ink-400">{names.join(" · ")}</p>;
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-4 w-4", n <= Math.round(rating) ? "fill-gold text-gold" : "text-ink-200")}
        />
      ))}
    </span>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-dark">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight text-ink sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-sm leading-relaxed text-ink-500">{subtitle}</p>}
    </div>
  );
}

export default function HomePage() {
  usePageMeta("Home", "Book premium haircuts, grooming and spa treatments at SalonPro.");

  const { settings } = usePublicSettings();
  const servicesQuery = usePublicServices();
  const staffQuery = usePublicStaff();
  const reviewsQuery = useQuery<Review[]>({
    queryKey: ["public", "reviews", 6],
    queryFn: () => apiGet<Review[]>("/public/reviews", { limit: 6 }),
    staleTime: 5 * 60 * 1000,
  });

  const services = servicesQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const reviews = (reviewsQuery.data ?? []).slice(0, 3);
  const hero = settings.heroImages[0];

  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-white">
        {hero && (
          <img
            src={hero}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35"
            loading="eager"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-ink/95 via-ink/80 to-ink/60" />
        <div className="container-x relative grid gap-12 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-28">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-gold-light">
              <Sparkles className="h-3.5 w-3.5" /> {settings.tagline || "Premium grooming"}
            </span>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Look sharp.
              <br />
              <span className="gold-text">Feel unstoppable.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70">
              {settings.salonName || "SalonPro"} brings master barbers, precision cuts and calming spa rituals
              together. Reserve in seconds — no account required.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="gold" size="lg">
                <Link to="/book">
                  <CalendarCheck className="h-5 w-5" /> Book an appointment
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/25 bg-white/5 text-white hover:border-gold hover:text-gold-light">
                <Link to="/services">
                  Browse services <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-sm text-white/70">
              {settings.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gold" />
                  <a href={`tel:${settings.phone}`} className="hover:text-gold">{settings.phone}</a>
                </div>
              )}
              {settings.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gold" />
                  <span>{settings.address}{settings.city ? `, ${settings.city}` : ""}</span>
                </div>
              )}
            </dl>
          </div>

          <div className="relative animate-fade-in">
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
              <CardContent className="space-y-4 p-6 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold/15 text-gold">
                    <Scissors className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-lg text-white">Why book with us</p>
                    <p className="text-xs text-white/60">Thoughtful details, every visit</p>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-white/75">
                  {[
                    { icon: CalendarCheck, text: "Instant confirmation on most bookings" },
                    { icon: Users, text: "Pick your favourite barber or let us choose" },
                    { icon: Clock, text: `Book up to ${settings.booking.maxAdvanceDays} days ahead` },
                  ].map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="gold" className="w-full">
                  <Link to="/book">Reserve your spot</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="container-x grid gap-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Services" value={services.length || "—"} icon={Scissors} hint="Tailored treatments" />
        <StatCard label="Expert team" value={staff.length || "—"} icon={Users} accent="ink" hint="Barbers & stylists" />
        <StatCard label="Guest reviews" value={reviewsQuery.data?.length ?? "—"} icon={Star} accent="success" hint="Verified visits" />
        <StatCard
          label="Open daily"
          value={settings.booking.minNoticeHours ? `${settings.booking.minNoticeHours}h` : "Easy"}
          icon={Clock}
          accent="gold"
          hint="Minimum notice"
        />
      </section>

      <section className="container-x py-16">
        <SectionHeading
          eyebrow="The menu"
          title="Services crafted for you"
          subtitle="From classic cuts to advanced colour and spa treatments — every service is delivered by trained professionals."
        />
        <div className="mt-10">
          {servicesQuery.isLoading ? (
            <LoadingState label="Loading services…" />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {services.slice(0, 4).map((service, index) => (
                <Card key={service.id} className="card-hover flex h-full flex-col overflow-hidden">
                  <div className="relative h-40 overflow-hidden bg-cream">
                    {service.imageUrls?.[0] ? (
                      <img
                        src={service.imageUrls[0]}
                        alt={service.name}
                        className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className={cn("flex h-full w-full items-center justify-center", index % 2 ? "bg-ink" : "bg-gold-soft")}>
                        <Scissors className={cn("h-8 w-8", index % 2 ? "text-gold" : "text-gold-dark")} />
                      </div>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col p-5">
                    <Badge variant="gold" className="w-fit">{service.category}</Badge>
                    <h3 className="mt-3 font-display text-lg text-ink">{service.name}</h3>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-ink-500">{service.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      {settings.payments.showPrices && (
                        <Money amount={service.discountPrice ?? service.price} currency={settings.currencySymbol} emphasis />
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                        <Clock className="h-3.5 w-3.5" /> {service.durationMinutes} min
                      </span>
                    </div>
                    <Button asChild variant="subtle" size="sm" className="mt-4 w-full">
                      <Link to={`/book/${service.id}`}>Book this</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        {services.length > 4 && (
          <div className="mt-8 text-center">
            <Button asChild variant="outline">
              <Link to="/services">View all services <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        )}
      </section>

      <section className="bg-cream/60 py-16">
        <div className="container-x">
          <SectionHeading
            eyebrow="The team"
            title="Meet your barbers"
            subtitle="Skilled hands, sharp eyes and a genuine love for the craft."
          />
          <div className="mt-10">
            {staffQuery.isLoading ? (
              <LoadingState label="Loading team…" />
            ) : staff.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {staff.slice(0, 4).map((member, index) => (
                  <Card key={member.id} className="card-hover overflow-hidden text-center">
                    <CardContent className="flex flex-col items-center p-6">
                      <Avatar src={member.photoUrl} name={member.name} className="h-20 w-20 border-2 border-gold/40" />
                      <h3 className="mt-4 font-display text-lg text-ink">{member.name}</h3>
                      <Badge variant={tone(index) === "ink" ? "outline" : "gold"} className="mt-2 capitalize">
                        {member.role}
                      </Badge>
                      {member.specialties?.length > 0 && (
                        <p className="mt-3 text-sm text-ink-500">{member.specialties.slice(0, 3).join(" · ")}</p>
                      )}
                      <StaffServices staff={member} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-ink-500">Our team directory is coming soon.</p>
            )}
          </div>
          {staff.length > 0 && (
            <div className="mt-8 text-center">
              <Button asChild variant="outline">
                <Link to="/staff">Meet the full team <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="container-x py-16">
          <SectionHeading eyebrow="Loved by guests" title="What people are saying" />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {reviews.map((review) => (
              <Card key={review.id} className="h-full">
                <CardContent className="flex h-full flex-col p-6">
                  <Stars rating={review.rating} />
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-600">“{review.comment}”</p>
                  <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                    <Avatar name={review.name} src={review.avatarUrl} className="h-9 w-9" />
                    <span className="text-sm font-medium text-ink">{review.name}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild variant="outline">
              <Link to="/reviews">Read all reviews <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </section>
      )}

      <section className="relative overflow-hidden bg-ink py-16 text-white">
        <div className="container-x relative text-center">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">Ready for a fresh look?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/70">
            Pick a service, choose your time and we&apos;ll handle the rest.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="gold" size="lg">
              <Link to="/book">Book now</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/25 bg-white/5 text-white hover:border-gold hover:text-gold-light">
              <Link to="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
