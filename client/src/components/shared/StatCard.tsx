import type { ComponentType, ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: number;
  icon?: ComponentType<{ className?: string }>;
  accent?: "gold" | "ink" | "success" | "danger";
  hint?: string;
  className?: string;
}

const accentMap = {
  gold: "bg-gold-soft text-gold-dark",
  ink: "bg-ink text-white",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
} as const;

export function StatCard({ label, value, delta, icon: Icon, accent = "gold", hint, className }: StatCardProps) {
  const positive = typeof delta === "number" && delta >= 0;

  return (
    <Card className={cn("card-hover overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          <p className="truncate font-display text-2xl text-ink">{value}</p>
          {(typeof delta === "number" || hint) && (
            <div className="flex items-center gap-2 text-xs">
              {typeof delta === "number" && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium",
                    positive ? "text-success" : "text-danger",
                  )}
                >
                  {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {Math.abs(delta)}%
                </span>
              )}
              {hint && <span className="text-ink-400">{hint}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", accentMap[accent])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
