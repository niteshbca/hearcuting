import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Receipt, SearchX, Trash2 } from "lucide-react";
import { apiDelete, apiGetList, apiPatch, apiPost } from "@/services/api";
import type { Expense, PaginationMeta } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { FormField } from "@/components/shared/FormField";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DateTime } from "@/components/shared/DateTime";
import { Money } from "@/components/shared/Money";
import { StatCard } from "@/components/shared/StatCard";
import { DateRangePicker, type DateRangeValue } from "@/components/shared/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const PAGE_SIZE = 15;

const categories = [
  "rent",
  "electricity",
  "salaries",
  "supplies",
  "maintenance",
  "marketing",
  "other",
] as const;

const paymentMethods = ["cash", "upi", "card", "bank", "other"] as const;

type ExpensePaymentMethod = (typeof paymentMethods)[number];

interface ExpenseSummary {
  totalAmount: number;
  count: number;
  byCategory: Array<{ category: string; total: number; count: number }>;
}

type ExpenseListMeta = PaginationMeta & { summary?: ExpenseSummary };

const expenseSchema = z.object({
  category: z.enum(categories),
  title: z.string().trim().min(2, "Title is too short").max(160),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  date: z.string().min(4, "Pick a date"),
  vendor: z.string().trim().max(160).optional(),
  paymentMethod: z.enum(paymentMethods),
  notes: z.string().max(1000).optional(),
});

type ExpenseValues = z.infer<typeof expenseSchema>;

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyValues(): ExpenseValues {
  return {
    category: "other",
    title: "",
    amount: 0,
    date: todayKey(),
    vendor: "",
    paymentMethod: "cash",
    notes: "",
  };
}

export default function AdminExpensesPage() {
  usePageMeta("Expenses", "Record and review salon operating expenses.");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRangeValue>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const query = useQuery({
    queryKey: ["expenses", { page, category, search, range }],
    queryFn: () =>
      apiGetList<Expense>("/expenses", {
        page,
        limit: PAGE_SIZE,
        category: category === "all" ? undefined : category,
        search: search || undefined,
        from: range.from,
        to: range.to,
      }),
    placeholderData: keepPreviousData,
  });

  const { control, handleSubmit, reset } = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      reset({
        category: editing.category,
        title: editing.title,
        amount: editing.amount,
        date: editing.date.slice(0, 10),
        vendor: editing.vendor ?? "",
        paymentMethod: (editing.paymentMethod as ExpensePaymentMethod) ?? "cash",
        notes: editing.notes ?? "",
      });
    } else {
      reset(emptyValues());
    }
  }, [dialogOpen, editing, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: ExpenseValues) => {
      const payload = {
        category: values.category,
        title: values.title,
        amount: values.amount,
        date: values.date,
        vendor: values.vendor || undefined,
        paymentMethod: values.paymentMethod,
        notes: values.notes || undefined,
      };
      return editing ? apiPatch<Expense>(`/expenses/${editing.id}`, payload) : apiPost<Expense>("/expenses", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Expense updated" : "Expense recorded");
      setDialogOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) =>
      toast.error("Couldn't save expense", { description: parseApiError(error).message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/expenses/${id}`),
    onSuccess: () => {
      toast.success("Expense deleted");
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) =>
      toast.error("Couldn't delete expense", { description: parseApiError(error).message }),
  });

  const expenses = query.data?.data ?? [];
  const meta = query.data?.meta as ExpenseListMeta | undefined;
  const summary = meta?.summary;
  const filtered = search !== "" || category !== "all" || range.from !== undefined || range.to !== undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Track rent, salaries, supplies and other outgoings."
        actions={
          <Button
            variant="gold"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> New expense
          </Button>
        }
      />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total expenses" value={<Money amount={summary.totalAmount} />} icon={Receipt} />
          <StatCard label="Entries" value={summary.count} accent="ink" />
          {summary.byCategory.slice(0, 2).map((row) => (
            <StatCard
              key={row.category}
              label={row.category}
              value={<Money amount={row.total} />}
              hint={`${row.count} entr${row.count === 1 ? "y" : "ies"}`}
              accent="gold"
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <DateRangePicker value={range} onChange={(value) => { setRange(value); setPage(1); }} />
          <SearchInput
            value={search}
            onChange={(value) => { setSearch(value); setPage(1); }}
            placeholder="Title, vendor or notes…"
            ariaLabel="Search expenses"
            className="sm:w-64"
          />
        </div>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={5} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load expenses"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={filtered ? SearchX : Receipt}
          title="No expenses found"
          description={filtered ? "Try adjusting filters or search." : "Record your first expense."}
          action={
            <Button variant="gold" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus /> New expense
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      <DateTime value={expense.date} />
                    </TableCell>
                    <TableCell className="font-medium text-ink">{expense.title}</TableCell>
                    <TableCell>
                      <Badge variant="muted" className="capitalize">
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink-500">{expense.vendor ?? "—"}</TableCell>
                    <TableCell className="capitalize text-ink-500">{expense.paymentMethod ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Money amount={expense.amount} emphasis />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(expense);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:text-danger"
                          onClick={() => deleteMutation.mutate(expense.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit expense" : "New expense"}</DialogTitle>
            <DialogDescription>Record an outgoing cost for the salon.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={control}
              name="category"
              label="Category"
              required
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={control}
              name="date"
              label="Date"
              required
              render={(field) => <Input type="date" {...field} />}
            />
            <FormField
              control={control}
              name="title"
              label="Title"
              required
              className="sm:col-span-2"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={control}
              name="amount"
              label="Amount"
              required
              render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
            />
            <FormField
              control={control}
              name="paymentMethod"
              label="Payment method"
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={control}
              name="vendor"
              label="Vendor"
              className="sm:col-span-2"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={control}
              name="notes"
              label="Notes"
              className="sm:col-span-2"
              render={(field) => <Textarea rows={3} {...field} />}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Record expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
