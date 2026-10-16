import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DateRangeValue {
  from?: string;
  to?: string;
}

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
  fromLabel?: string;
  toLabel?: string;
}

export function DateRangePicker({
  value,
  onChange,
  className,
  fromLabel = "From",
  toLabel = "To",
}: DateRangePickerProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end", className)}>
      <div className="grid gap-1.5">
        <Label htmlFor="range-from">{fromLabel}</Label>
        <Input
          id="range-from"
          type="date"
          value={value.from ?? ""}
          max={value.to}
          onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="range-to">{toLabel}</Label>
        <Input
          id="range-to"
          type="date"
          value={value.to ?? ""}
          min={value.from}
          onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
