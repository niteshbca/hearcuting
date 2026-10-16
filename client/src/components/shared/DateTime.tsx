import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/utils";

export interface DateTimeProps {
  value: string | number | Date | null | undefined;
  datePattern?: string;
  timePattern?: string;
  showTime?: boolean;
  className?: string;
}

export function DateTime({
  value,
  datePattern = "dd MMM yyyy",
  timePattern = "hh:mm a",
  showTime = false,
  className,
}: DateTimeProps) {
  const date = formatDate(value, datePattern);
  const text = showTime && date !== "—" ? `${date} · ${formatTime(value, timePattern)}` : date;
  return <span className={cn("tabular-nums", className)}>{text}</span>;
}
