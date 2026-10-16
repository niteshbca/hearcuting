import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { BookingStatus, EmailStatus, InvoiceStatus, PaymentStatus } from "@/types";

type Variant = NonNullable<BadgeProps["variant"]>;

const BOOKING: Record<BookingStatus, { label: string; variant: Variant; dot: string }> = {
  pending: { label: "Pending", variant: "warning", dot: "bg-warning" },
  confirmed: { label: "Confirmed", variant: "info", dot: "bg-info" },
  in_progress: { label: "In Progress", variant: "gold", dot: "bg-gold" },
  completed: { label: "Completed", variant: "success", dot: "bg-success" },
  cancelled: { label: "Cancelled", variant: "danger", dot: "bg-danger" },
  no_show: { label: "No Show", variant: "muted", dot: "bg-ink-400" },
};

const PAYMENT: Record<PaymentStatus, { label: string; variant: Variant; dot: string }> = {
  unpaid: { label: "Unpaid", variant: "muted", dot: "bg-ink-400" },
  deposit_paid: { label: "Deposit Paid", variant: "warning", dot: "bg-warning" },
  paid: { label: "Paid", variant: "success", dot: "bg-success" },
  refunded: { label: "Refunded", variant: "danger", dot: "bg-danger" },
  partially_paid: { label: "Partially Paid", variant: "info", dot: "bg-info" },
};

const INVOICE: Record<InvoiceStatus, { label: string; variant: Variant; dot: string }> = {
  draft: { label: "Draft", variant: "muted", dot: "bg-ink-400" },
  unpaid: { label: "Unpaid", variant: "warning", dot: "bg-warning" },
  partially_paid: { label: "Partially Paid", variant: "info", dot: "bg-info" },
  paid: { label: "Paid", variant: "success", dot: "bg-success" },
  refunded: { label: "Refunded", variant: "danger", dot: "bg-danger" },
  void: { label: "Void", variant: "muted", dot: "bg-ink-400" },
};

const EMAIL: Record<EmailStatus, { label: string; variant: Variant; dot: string }> = {
  queued: { label: "Queued", variant: "muted", dot: "bg-ink-400" },
  sending: { label: "Sending", variant: "info", dot: "bg-info" },
  sent: { label: "Sent", variant: "success", dot: "bg-success" },
  failed: { label: "Failed", variant: "danger", dot: "bg-danger" },
  retrying: { label: "Retrying", variant: "warning", dot: "bg-warning" },
};

type StatusKind = "booking" | "payment" | "invoice" | "email";

interface StatusMeta {
  label: string;
  variant: Variant;
  dot: string;
}

function resolve(kind: StatusKind, status: string): StatusMeta {
  const table: Record<StatusKind, Record<string, StatusMeta>> = {
    booking: BOOKING as unknown as Record<string, StatusMeta>,
    payment: PAYMENT as unknown as Record<string, StatusMeta>,
    invoice: INVOICE as unknown as Record<string, StatusMeta>,
    email: EMAIL as unknown as Record<string, StatusMeta>,
  };
  return (
    table[kind][status] ?? {
      label: status.replace(/_/g, " "),
      variant: "outline",
      dot: "bg-ink-400",
    }
  );
}

export interface StatusBadgeProps {
  kind: StatusKind;
  status: string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ kind, status, className, showDot = true }: StatusBadgeProps) {
  const meta = resolve(kind, status);
  return (
    <Badge variant={meta.variant} className={cn("capitalize", className)}>
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden="true" />}
      {meta.label}
    </Badge>
  );
}
