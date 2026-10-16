import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "default" | "lg";
  label?: string;
}

const sizeMap = {
  sm: "h-4 w-4",
  default: "h-6 w-6",
  lg: "h-9 w-9",
} as const;

export function Spinner({ className, size = "default", label = "Loading", ...props }: SpinnerProps) {
  return (
    <div role="status" aria-label={label} className={cn("inline-flex", className)} {...props}>
      <Loader2 className={cn("animate-spin text-gold", sizeMap[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function FullPageSpinner({ label = "Loading SalonPro" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Spinner size="lg" label={label} />
    </div>
  );
}
