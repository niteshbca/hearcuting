import { Link } from "react-router-dom";
import { Award, CalendarCheck, HeartHandshake, Scissors, Sparkles, Users } from "lucide-react";
import { usePublicServices, usePublicSettings, usePublicStaff } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";

const VALUES = [
  { icon: Scissors, title: "Craft first", text: "Every cut and treatment is executed with precision and patience." },
  { icon: Sparkles, title: "Premium products", text: "We use salon-grade products that respect your hair and skin." },
  { icon: HeartHandshake, title: "Genuine care", text: "Friendly, unhurried service from the moment you walk in." },
  { icon: Award, title: "Trusted locally", text: "A loyal community that keeps coming back, style after style." },
];

export default function AboutPage() {
  usePageMeta("About Us", "The story, craft and people behind SalonPro.");

  const { settings } = usePublicSettings();
  const servicesQuery = usePublicServices();
  const staffQuery = usePublicStaff();

  const services = servicesQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const image = settings.heroImages[0] ?? settings.galleryImages[0]?.url;

  return (
    <div className="container-x space-y-14 py-12">
      <PageHeader
        eyebrow="Our story"
        title={`About ${settings.salonName || "SalonPro"}`}
        subtitle={settings.tagline || "Precision grooming, thoughtful service and a space designed to help you unwind."}
      />

      <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="space-y-5">
          <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Where sharp style meets calm comfort
          </h2>
          <p className="text-sm leading-relaxed text-ink-600">
            {settings.aboutText ||
              `${settings.salonName || "SalonPro"} is a modern salon and barbershop built around one simple idea — great grooming should feel effortless. Our team blends time-honoured technique with contemporary style, so whether you want a clean fade, a bold new colour or a restorative treatment, you leave feeling your best.`}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-ink">{title}</p>
                  <p className="text-sm text-ink-500">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-lg border border-border shadow-lift">
            {image ? (
              <img src={image} alt={`${settings.salonName || "SalonPro"} interior`} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-ink">
                <Scissors className="h-12 w-12 text-gold" />
              </div>
            )}
          </div>
          <Card className="absolute -bottom-6 -left-4 hidden w-48 border-gold/30 bg-white/95 backdrop-blur sm:block">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-gold">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-xl text-ink">{staff.length || "—"}</p>
                <p className="text-xs text-ink-500">Expert specialists</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Services" value={services.length || "—"} icon={Scissors} hint="On the menu" />
        <StatCard label="Team" value={staff.length || "—"} icon={Users} accent="ink" hint="Barbers & stylists" />
        <StatCard label="Booking window" value={`${settings.booking.maxAdvanceDays}d`} icon={CalendarCheck} accent="success" hint="Plan ahead" />
        <StatCard label="Guest booking" value={settings.booking.allowGuest ? "Open" : "Account"} icon={Sparkles} accent="gold" hint="How to reserve" />
      </section>

      {staff.length > 0 && (
        <section className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-dark">The people</p>
            <h2 className="mt-2 font-display text-2xl tracking-tight text-ink">Behind the chair</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {staff.slice(0, 4).map((member) => (
              <Card key={member.id} className="text-center">
                <CardContent className="flex flex-col items-center p-6">
                  <Avatar src={member.photoUrl} name={member.name} className="h-16 w-16 border border-gold/40" />
                  <p className="mt-3 font-medium text-ink">{member.name}</p>
                  <p className="mt-0.5 text-xs capitalize text-ink-400">{member.role}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div>
            <Button asChild variant="outline">
              <Link to="/staff">Meet the full team</Link>
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-lg bg-ink px-6 py-12 text-center text-white sm:px-12">
        <h2 className="font-display text-2xl tracking-tight text-white sm:text-3xl">Come see the difference</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/70">
          Reserve a chair and let our team take care of the rest.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild variant="gold" size="lg">
            <Link to="/book">Book an appointment</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/25 bg-white/5 text-white hover:border-gold hover:text-gold-light">
            <Link to="/contact">Visit us</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
