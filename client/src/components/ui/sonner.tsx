import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-right"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-lg border border-border bg-white text-ink shadow-lift font-sans",
          title: "text-sm font-semibold text-ink",
          description: "text-sm text-ink-500",
          actionButton: "bg-ink text-white rounded-sm text-xs",
          cancelButton: "bg-ink-100 text-ink rounded-sm text-xs",
          success: "border-gold/40 [&_[data-icon]]:text-gold-dark",
          error: "border-danger/30 [&_[data-icon]]:text-danger",
          warning: "border-warning/30 [&_[data-icon]]:text-warning",
          info: "border-info/30 [&_[data-icon]]:text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
