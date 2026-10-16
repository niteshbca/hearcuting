import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Scissors } from "lucide-react";
import { usePublicServices, usePublicSettings } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const ALL = "all";

export default function ServicesPage() {
  usePageMeta("Services", "Every cut, style and treatment we offer at SalonPro.");

  const { settings } = usePublicSettings();
  const { data, isLoading, isError, refetch } = usePublicServices();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);

  const services = data ?? [];

  const categories = useMemo(
    () => Array.from(new Set(services.map((s) => s.category).filter(Boolean))).sort(),
    [services],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return services.filter((s) => {
      if (category !== ALL && s.category !== category) return false;
      if (!term) return true;
      return `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(term);
    });
  }, [services, search, category]);

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="The menu"
        title="Our services"
        subtitle="Explore treatments across cuts, colour, grooming and spa. Prices and durations are shown up front."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search services…" className="sm:max-w-xs" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-500">Category</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading services…" />
      ) : isError ? (
        <ErrorState message="We couldn't load our services right now." onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title={services.length ? "No services match your filters" : "No services available"}
          description={
            services.length
              ? "Try a different search term or category."
              : "Our service menu is being updated. Please check back shortly."
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((service) => (
            <Card key={service.id} className="card-hover flex h-full flex-col overflow-hidden">
              <div className="relative h-44 overflow-hidden bg-cream">
                {service.imageUrls?.[0] ? (
                  <img
                    src={service.imageUrls[0]}
                    alt={service.name}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gold-soft">
                    <Scissors className="h-9 w-9 text-gold-dark" />
                  </div>
                )}
              </div>
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="gold">{service.category}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                    <Clock className="h-3.5 w-3.5" /> {service.durationMinutes} min
                  </span>
                </div>
                <h3 className="mt-3 font-display text-lg text-ink">{service.name}</h3>
                <p className="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-500">
                  {service.description}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  {settings.payments.showPrices ? (
                    <div className="flex items-baseline gap-2">
                      <Money
                        amount={service.discountPrice ?? service.price}
                        currency={settings.currencySymbol}
                        emphasis
                      />
                      {typeof service.discountPrice === "number" && service.discountPrice < service.price && (
                        <span className="text-xs text-ink-400 line-through">
                          <Money amount={service.price} currency={settings.currencySymbol} />
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-ink-400">Price on request</span>
                  )}
                  <Button asChild variant="gold" size="sm">
                    <Link to={`/book/${service.id}`}>Book</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
