import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  ariaLabel?: string;
}

export function SearchInput({
  value = "",
  onChange,
  placeholder = "Search…",
  className,
  debounceMs = 350,
  ariaLabel = "Search",
}: SearchInputProps) {
  const [internal, setInternal] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    if (internal === value) return;
    const handle = window.setTimeout(() => onChangeRef.current(internal), debounceMs);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internal, debounceMs]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <Input
        type="search"
        value={internal}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-9 pr-9"
        onChange={(e) => setInternal(e.target.value)}
      />
      {internal && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setInternal("");
            onChangeRef.current("");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-ink-400 transition-colors hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
