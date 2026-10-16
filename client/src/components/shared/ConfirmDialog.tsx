import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmContextValue {
  confirm: (options?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const confirm = useCallback((options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      if (busyRef.current) return;
      pending?.resolve(value);
      setPending(null);
      setBusy(false);
    },
    [pending],
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.title ?? "Are you sure?"}</DialogTitle>
            <DialogDescription>
              {pending?.description ?? "This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {pending?.cancelText ?? "Cancel"}
            </Button>
            <Button
              variant={pending?.destructive ? "default" : "gold"}
              className={pending?.destructive ? "bg-danger hover:bg-danger/90" : undefined}
              onClick={() => {
                busyRef.current = true;
                setBusy(true);
                close(true);
                busyRef.current = false;
              }}
            >
              {busy ? "Working…" : (pending?.confirmText ?? "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (options?: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx.confirm;
}
