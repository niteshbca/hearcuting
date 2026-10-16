import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MessageSquarePlus, Star } from "lucide-react";
import { apiGet, apiPost } from "@/services/api";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { Review } from "@/types";
import { parseApiError, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  rating: z.number().int().min(1, "Pick a rating").max(5),
  comment: z.string().trim().min(3, "Please write a short review").max(2000),
});

type FormValues = z.infer<typeof schema>;

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-4 w-4", n <= Math.round(rating) ? "fill-gold text-gold" : "text-ink-200")}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  usePageMeta("Reviews", "What our guests are saying about SalonPro.");

  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<Review[]>({
    queryKey: ["public", "reviews", 50],
    queryFn: () => apiGet<Review[]>("/public/reviews", { limit: 50 }),
    staleTime: 5 * 60 * 1000,
  });

  const reviews = data ?? [];
  const [rating, setRating] = useState(0);

  const summary = useMemo(() => {
    if (!reviews.length) return { average: 0, count: 0 };
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    return { average: total / reviews.length, count: reviews.length };
  }, [reviews]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", rating: 0, comment: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiPost<{ message: string }>("/reviews", {
        name: values.name.trim(),
        rating: values.rating,
        comment: values.comment.trim(),
      }),
    onSuccess: () => {
      toast.success("Thanks for your review!", {
        description: "It will appear once our team has reviewed it.",
      });
      reset({ name: "", rating: 0, comment: "" });
      setRating(0);
      void queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
    },
    onError: (error) => {
      const { message } = parseApiError(error);
      toast.error("Could not submit review", { description: message });
    },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  return (
    <div className="container-x space-y-10 py-12">
      <PageHeader
        eyebrow="Testimonials"
        title="Guest reviews"
        subtitle="Honest words from the people who sit in our chairs every day."
      />

      {summary.count > 0 && (
        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-cream/50 px-6 py-5">
          <div className="flex items-center gap-4">
            <span className="font-display text-4xl text-ink">{summary.average.toFixed(1)}</span>
            <div>
              <Stars rating={summary.average} />
              <p className="mt-1 text-xs text-ink-500">
                Based on {summary.count} review{summary.count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {isLoading ? (
            <LoadingState label="Loading reviews…" />
          ) : isError ? (
            <ErrorState message="We couldn't load reviews right now." onRetry={() => void refetch()} />
          ) : reviews.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No reviews yet"
              description="Be the first to share your experience with us."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {reviews.map((review) => (
                <Card key={review.id} className="h-full">
                  <CardContent className="flex h-full flex-col p-5">
                    <Stars rating={review.rating} />
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-600">“{review.comment}”</p>
                    <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                      <Avatar name={review.name} src={review.avatarUrl} className="h-9 w-9" />
                      <div>
                        <p className="text-sm font-medium text-ink">{review.name}</p>
                        <p className="text-xs text-ink-400">{formatDate(review.createdAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <aside>
          <Card className="sticky top-24">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-5 w-5 text-gold-dark" />
                <h2 className="font-display text-lg text-ink">Write a review</h2>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                <FormField
                  control={control}
                  name="name"
                  label="Your name"
                  required
                  render={(field) => (
                    <Input
                      id="name"
                      placeholder="e.g. Priya S."
                      value={String(field.value ?? "")}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />

                <FormField
                  control={control}
                  name="rating"
                  label="Rating"
                  required
                  render={(field) => (
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`${n} star${n === 1 ? "" : "s"}`}
                          onClick={() => {
                            field.onChange(n);
                            setRating(n);
                          }}
                          className="rounded-sm transition-transform hover:scale-110"
                        >
                          <Star
                            className={cn(
                              "h-7 w-7",
                              n <= (rating || Number(field.value) || 0)
                                ? "fill-gold text-gold"
                                : "text-ink-200",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                />

                <FormField
                  control={control}
                  name="comment"
                  label="Your review"
                  required
                  render={(field) => (
                    <Textarea
                      id="comment"
                      rows={4}
                      placeholder="Tell us about your visit…"
                      value={String(field.value ?? "")}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />

                <Button type="submit" variant="gold" className="w-full" disabled={isSubmitting || mutation.isPending}>
                  {mutation.isPending ? "Submitting…" : "Submit review"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
