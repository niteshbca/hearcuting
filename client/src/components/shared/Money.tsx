import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

export interface MoneyProps {
  amount: number;
  currency?: string;
  className?: string;
  emphasis?: boolean;
}

export function Money({ amount, currency = "₹", className, emphasis }: MoneyProps) {
  return (
    <span
      className={cn("tabular-nums", emphasis && "font-semibold text-ink", className)}
      title={String(amount)}
    >
      {formatCurrency(amount, currency)}
    </span>
  );
}
