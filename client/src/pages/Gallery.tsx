import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

const ALL = "all";

export default function GalleryPage() {
  usePageMeta("Gallery", "Fresh work from the SalonPro floor.");

  const { settings, isLoading } = usePublicSettings();
  const [category, setCategory] = useState(ALL);
  const [active, setActive] = useState<number | null>(null);

  const images = useMemo(
    () => (settings.galleryImages ?? []).filter((img) => img?.url),
    [settings.galleryImages],
  );

  const categories = useMemo(
    () => Array.from(new Set(images.map((img) => img.category).filter(Boolean))).sort() as string[],
    [images],
  );

  const filtered = useMemo(
    () => (category === ALL ? images : images.filter((img) => img.category === category)),
    [images, category],
  );

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="Portfolio"
        title="Gallery"
        subtitle="A look at the cuts, colours and finishes coming out of our chairs."
      />

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(ALL)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              category === ALL
                ? "border-gold bg-gold-soft text-gold-dark"
                : "border-border text-ink-500 hover:border-gold hover:text-gold-dark",
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                category === c
                  ? "border-gold bg-gold-soft text-gold-dark"
                  : "border-border text-ink-500 hover:border-gold hover:text-gold-dark",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-cream" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No photos yet"
          description="Our gallery is being updated. Follow us on social media for the latest work."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((img, index) => (
            <button
              key={`${img.url}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              className="group relative overflow-hidden rounded-lg border border-border bg-cream text-left"
            >
              <img
                src={img.url}
                alt={img.caption ?? "Salon work"}
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              {(img.caption || img.category) && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4">
                  {img.caption && <span className="block text-sm font-medium text-white">{img.caption}</span>}
                  {img.category && (
                    <span className="block text-xs capitalize text-white/70">{img.category}</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">{filtered[active ?? 0]?.caption ?? "Gallery image"}</DialogTitle>
          {active !== null && filtered[active] && (
            <figure>
              <img
                src={filtered[active].url}
                alt={filtered[active].caption ?? "Salon work"}
                className="max-h-[75vh] w-full object-contain"
              />
              {filtered[active].caption && (
                <figcaption className="border-t border-border p-4 text-sm text-ink-600">
                  {filtered[active].caption}
                </figcaption>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
