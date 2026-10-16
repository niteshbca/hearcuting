import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DataTableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function DataTableSkeleton({ rows = 6, columns = 5, className }: DataTableSkeletonProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-white", className)}>
      <div className="flex items-center gap-4 border-b border-border bg-cream/60 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3.5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className={cn("h-4 flex-1", c === 0 && "max-w-[9rem]")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
