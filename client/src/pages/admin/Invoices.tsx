import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { apiGetList } from "@/services/api";
import type { Invoice } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DateRangePicker, type DateRangeValue } from "@/components/shared/DateRangePicker";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { parseApiError } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "draft", label: "Draft" },
  { value: "void", label: "Void" },
] as const;

const PAGE_SIZE = 15;

function customerLabel(customer: Invoice["customer"]): string {
  if (!customer) return "Walk-in";
  if (typeof customer === "string") return "Customer";
  return customer.name || customer.email || "Customer";
}

export default function AdminInvoicesPage() {
  usePageMeta("Invoices", "Bills, payments and refunds.");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRangeValue>({});

  const query = useQuery({
    queryKey: ["invoices", { page, status, search, range }],
    queryFn: () =>
      apiGetList<Invoice>("/invoices", {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
        search: search || undefined,
        from: range.from,
        to: range.to,
        sort: "-createdAt",
      }),
    placeholderData: keepPreviousData,
  });

  const invoices = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = status !== "all" || search !== "" || Boolean(range.from || range.to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Every bill raised at the salon, with payments and refunds."
        actions={
          <Button asChild variant="gold">
            <Link to="/admin/pos">
              <Plus /> New sale
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <TabsList className="flex-wrap">
            {STATUS_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value}>
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <DateRangePicker value={range} onChange={(value) => { setRange(value); setPage(1); }} />
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Invoice #, customer…"
            ariaLabel="Search invoices"
            className="sm:w-64"
          />
        </div>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={7} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load invoices"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description={
            filtered
              ? "Try a different filter, date range or search term."
              : "Invoices you create at the POS will appear here."
          }
          action={
            <Button asChild variant="gold">
              <Link to="/admin/pos">Create a sale</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="font-medium text-ink">{customerLabel(invoice.customer)}</TableCell>
                    <TableCell>
                      <DateTime value={invoice.issuedAt ?? invoice.createdAt} showTime />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="invoice" status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={invoice.total} emphasis />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={invoice.amountPaid} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money amount={invoice.balanceDue} className={invoice.balanceDue > 0 ? "text-danger" : undefined} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/admin/invoices/${invoice.id}`}>View</Link>
                      </Button>
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
    </div>
  );
}
