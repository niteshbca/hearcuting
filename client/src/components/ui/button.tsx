import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-white hover:bg-ink-700 shadow-soft",
        gold: "bg-gradient-to-r from-gold-dark via-gold to-gold-light bg-[length:160%_100%] bg-left text-ink font-semibold hover:bg-right hover:shadow-gold",
        outline: "border border-ink/15 bg-white text-ink hover:border-gold hover:text-gold-dark",
        ghost: "text-ink hover:bg-ink-100 hover:text-ink",
        subtle: "bg-cream text-ink hover:bg-gold-soft",
        link: "text-gold-dark underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 rounded-sm px-2.5 text-xs",
        sm: "h-8 rounded-sm px-3 text-sm",
        default: "h-10 px-5 text-sm",
        lg: "h-12 rounded-lg px-7 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
