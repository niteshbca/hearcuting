import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BadgeCheck, Check, Crown, Sparkles } from "lucide-react";
import { apiGet } from "@/services/api";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { MembershipPlan } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Money } from "@/components/shared/Money";
import { cn } from "@/lib/utils";

export default function MembershipsPage() {
  usePageMeta("Memberships", "Priority booking and member-only perks at SalonPro.");

  const { settings } = usePublicSettings();
  const { data, isLoading, isError, refetch } = useQuery<MembershipPlan[]>({
    queryKey: ["public", "plans"],
    queryFn: () => apiGet<MembershipPlan[]>("/public/plans"),
    staleTime: 5 * 60 * 1000,
  });

  const plans = data ?? [];

  return (
    <div className="container-x space-y-10 py-12">
      <PageHeader
        eyebrow="Membership"
        title="Plans & packages"
        subtitle="Prepay for the services you love, unlock member pricing and skip the queue."
      />

      <section className="rounded-lg bg-ink px-6 py-10 text-white sm:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-gold-light">
              <Sparkles className="h-3.5 w-3.5" /> Member benefits
            </span>
            <h2 className="mt-4 font-display text-2xl tracking-tight text-white sm:text-3xl">
              More value, every visit
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Choose a package that fits your routine. Redeem services at the counter and track your remaining
              balance any time.
            </p>
          </div>
          <Button asChild variant="gold" size="lg">
            <Link to="/contact">Talk to our team</Link>
          </Button>
        </div>
      </section>

      {isLoading ? (
        <LoadingState label="Loading plans…" />
      ) : isError ? (
        <ErrorState message="We couldn't load membership plans right now." onRetry={() => void refetch()} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="No plans available yet"
          description="Our membership plans are being finalised. Contact us to learn more about upcoming offers."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const featured = plans.length > 2 && index === 1;
            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative flex h-full flex-col overflow-hidden",
                  featured && "border-gold shadow-gold lg:-translate-y-2",
                )}
              >
                {featured && (
                  <div className="bg-gold px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-ink">
                    Most popular
                  </div>
                )}
                <CardContent className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between">
                    <Badge variant={featured ? "gold" : "outline"} className="capitalize">
                      {plan.type}
                    </Badge>
                    {featured && <Crown className="h-5 w-5 text-gold-dark" />}
                  </div>
                  <h3 className="mt-4 font-display text-xl text-ink">{plan.name}</h3>
                  {plan.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{plan.description}</p>
                  )}

                  <div className="mt-5 flex items-baseline gap-2">
                    <Money amount={plan.price} currency={settings.currencySymbol} className="font-display text-3xl text-ink" emphasis />
                    <span className="text-sm text-ink-400">/ {plan.validityDays} days</span>
                  </div>

                  {typeof plan.credits === "number" && plan.credits > 0 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-gold-dark">
                      <Sparkles className="h-4 w-4" /> {plan.credits} prepaid credits included
                    </p>
                  )}

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.includes.map((item, i) => (
                      <li key={`${plan.id}-${i}`} className="flex items-start gap-3 text-sm text-ink-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>
                          {item.serviceName || "Included service"}
                          <span className="text-ink-400">
                            {" "}
                            · {item.limitTotal} time{item.limitTotal === 1 ? "" : "s"}
                            {item.discountPercent ? ` · ${item.discountPercent}% off` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild variant={featured ? "gold" : "outline"} className="mt-6 w-full">
                    <Link to="/contact">
                      <BadgeCheck className="h-4 w-4" /> Enquire &amp; join
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
