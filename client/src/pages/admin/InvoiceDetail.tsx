import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Receipt, RotateCcw, Ban, Printer } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/services/api";
import type { Invoice, Payment } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import type { Role } from "@/types";

interface InvoiceDetailResponse {
  invoice: Invoice;
  payments: Payment[];
}

const refundSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  reason: z.string().trim().max(500).optional(),
});

type RefundValues = z.infer<typeof refundSchema>;

const REFUND_ROLES: Role[] = ["owner", "manager", "accountant"];

function customerLabel(invoice: Invoice): string {
  const customer = invoice.customer;
  if (!customer) return "Walk-in";
  if (typeof customer === "string") return "Customer";
  return customer.name || customer.email || "Customer";
}

export default function AdminInvoiceDetailPage() {
  const { id = "" } = useParams();
  usePageMeta("Invoice", "Invoice detail, payments and refunds.");
  const { user } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [refundOpen, setRefundOpen] = useState(false);

  const query = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiGet<InvoiceDetailResponse>(`/invoices/${id}`),
    enabled: Boolean(id),
  });

  const invoice = query.data?.invoice;
  const payments = query.data?.payments ?? [];

  const canRefund = Boolean(user && REFUND_ROLES.includes(user.role));
  const canVoid =
    invoice && (invoice.status === "draft" || invoice.status === "unpaid") && invoice.amountPaid <= 0;

  const { control, handleSubmit, reset } = useForm<RefundValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: { amount: 0, reason: "" },
  });

  const refundMutation = useMutation({
    mutationFn: (values: RefundValues) =>
      apiPost<{ payment: Payment; invoice: Invoice }>(`/invoices/${id}/refund`, {
        amount: values.amount,
        reason: values.reason || undefined,
      }),
    onSuccess: () => {
      toast.success("Refund processed");
      setRefundOpen(false);
      reset({ amount: 0, reason: "" });
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) =>
      toast.error("Couldn't process refund", { description: parseApiError(error).message }),
  });

  const voidMutation = useMutation({
    mutationFn: () => apiPatch<Invoice>(`/invoices/${id}/status`, { status: "void" }),
    onSuccess: () => {
      toast.success("Invoice voided");
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) =>
      toast.error("Couldn't void invoice", { description: parseApiError(error).message }),
  });

  async function handleVoid() {
    const ok = await confirm({
      title: "Void this invoice?",
      description: "The invoice will be marked void and will no longer count towards revenue.",
      confirmText: "Void invoice",
      destructive: true,
    });
    if (ok) voidMutation.mutate();
  }

  function onRefundSubmit(values: RefundValues) {
    refundMutation.mutate(values);
  }

  if (query.isLoading) {
    return <LoadingState label="Loading invoice…" className="py-20" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load invoice"
        message={parseApiError(query.error).message}
        onRetry={() => query.refetch()}
      />
    );
  }

  if (!invoice) {
    return (
      <ErrorState title="Invoice not found" message="This invoice may have been removed." />
    );
  }

  const refundable = Math.max(0, invoice.amountPaid - invoice.refundedAmount);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Invoice"
        title={invoice.invoiceNumber}
        subtitle={`Issued ${new Date(invoice.issuedAt ?? invoice.createdAt ?? Date.now()).toLocaleString()}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/invoices">
                <ArrowLeft /> Back
              </Link>
            </Button>
            {canVoid && (
              <Button variant="outline" size="sm" disabled={voidMutation.isPending} onClick={handleVoid}>
                <Ban /> Void
              </Button>
            )}
            {canRefund && refundable > 0 && (
              <Button variant="gold" size="sm" onClick={() => setRefundOpen(true)}>
                <RotateCcw /> Refund
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-gold-dark" /> Items
            </CardTitle>
            <StatusBadge kind="invoice" status={invoice.status} />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item, index) => (
                  <TableRow key={`${item.name}-${index}`}>
                    <TableCell className="font-medium text-ink">{item.name}</TableCell>
                    <TableCell className="capitalize text-ink-500">{item.type}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Money amount={item.unitPrice} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={item.total} emphasis />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Customer</span>
                <span className="font-medium text-ink">{customerLabel(invoice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Subtotal</span>
                <Money amount={invoice.subtotal} />
              </div>
              {invoice.discount.amount > 0 && (
                <div className="flex justify-between text-success">
                  <span>
                    Discount
                    {invoice.discount.type === "percent" ? ` (${invoice.discount.value}%)` : ""}
                  </span>
                  <span>
                    −<Money amount={invoice.discount.amount} />
                  </span>
                </div>
              )}
              {invoice.tax.amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-500">Tax ({invoice.tax.rate}%)</span>
                  <Money amount={invoice.tax.amount} />
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-base">
                <span className="font-medium text-ink">Total</span>
                <Money amount={invoice.total} emphasis />
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Paid</span>
                <Money amount={invoice.amountPaid} />
              </div>
              {invoice.refundedAmount > 0 && (
                <div className="flex justify-between text-danger">
                  <span>Refunded</span>
                  <Money amount={invoice.refundedAmount} />
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink-500">Balance due</span>
                <Money amount={invoice.balanceDue} emphasis />
              </div>
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-ink-600">{invoice.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-gold-dark" /> Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-sm text-ink-500">No captured payments recorded for this invoice.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="capitalize">{payment.method}</TableCell>
                    <TableCell>
                      <StatusBadge kind="payment" status={payment.status} />
                    </TableCell>
                    <TableCell>
                      <DateTime value={payment.paidAt} showTime />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">
                      {payment.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={payment.amount} emphasis />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={payment.refundedAmount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              Up to <Money amount={refundable} /> can be refunded on this invoice.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onRefundSubmit)} className="grid gap-4" noValidate>
            <FormField
              control={control}
              name="amount"
              label="Amount"
              required
              render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
            />
            <FormField
              control={control}
              name="reason"
              label="Reason"
              render={(field) => <Textarea rows={3} placeholder="Optional note…" {...field} />}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={refundMutation.isPending}>
                {refundMutation.isPending ? "Processing…" : "Refund"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
