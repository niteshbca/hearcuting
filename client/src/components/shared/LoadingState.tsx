import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export interface LoadingStateProps {
  label?: string;
  className?: string;
  minHeight?: string;
}

export function LoadingState({ label = "Loading…", className, minHeight = "12rem" }: LoadingStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 text-center", className)}
      style={{ minHeight }}
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <p className="text-sm text-ink-500">{label}</p>
    </div>
  );
}
