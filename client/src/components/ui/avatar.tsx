import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  fallbackClassName?: string;
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, src, alt, name = "", fallbackClassName, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);

    React.useEffect(() => {
      setErrored(false);
    }, [src]);

    const showImage = Boolean(src) && !errored;

    return (
      <span
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full",
          className,
        )}
        {...props}
      >
        {showImage ? (
          <img
            src={src ?? undefined}
            alt={alt ?? name ?? "Avatar"}
            className="aspect-square h-full w-full object-cover"
            onError={() => setErrored(true)}
            loading="lazy"
          />
        ) : (
          <span
            aria-label={name || "Avatar"}
            className={cn(
              "flex h-full w-full items-center justify-center rounded-full bg-gold-soft text-sm font-semibold text-gold-dark",
              fallbackClassName,
            )}
          >
            {initials(name)}
          </span>
        )}
      </span>
    );
  },
);
Avatar.displayName = "Avatar";
