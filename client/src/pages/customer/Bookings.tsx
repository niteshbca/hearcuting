import { useState } from "react";
import { Link } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CalendarX2, Eye } from "lucide-react";
import { apiGetList, apiPost } from "@/services/api";
import type { Appointment, AppointmentSnapshot, BookingStatus, PaymentStatus } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
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
import { toast } from "@/components/ui/sonner";

interface MineAppointment {
  id: string;
  reference: string;
  serviceSnapshot: AppointmentSnapshot;
  date: string;
  startsAt: string;
  staff: { id: string; name: string } | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalPrice: number;
  depositAmount: number;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const PAGE_SIZE = 10;

export default function DashboardBookingsPage() {
  usePageMeta("My Bookings", "View, reschedule or cancel your appointments.");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const query = useQuery({
    queryKey: ["appointments", "mine", { page, status, search }],
    queryFn: () =>
      apiGetList<MineAppointment>("/appointments/mine", {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
        search: search || undefined,
        sort: "-startsAt",
      }),
    placeholderData: keepPreviousData,
  });

  const cancelMutation = useMutation({
    mutationFn: (reference: string) =>
      apiPost<{ appointment: Appointment }>(`/appointments/${reference}/cancel`, {}),
    onSuccess: () => {
      toast.success("Booking cancelled");
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["customer", "summary"] });
    },
    onError: (error) => {
      toast.error("Couldn't cancel booking", { description: parseApiError(error).message });
    },
  });

  async function handleCancel(reference: string) {
    const ok = await confirm({
      title: "Cancel this booking?",
      description: "Your slot will be released. You can always book again later.",
      confirmText: "Cancel booking",
      cancelText: "Keep it",
      destructive: true,
    });
    if (ok) cancelMutation.mutate(reference);
  }

  const bookings = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = search !== "" || status !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bookings"
        subtitle="Every appointment, past and upcoming."
        actions={
          <Button asChild variant="gold" size="sm">
            <Link to="/book">Book now</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search by reference…"
          ariaLabel="Search bookings"
          className="sm:w-72"
        />
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={6} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load bookings"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="No bookings found"
          description={
            filtered
              ? "Try a different filter or search term."
              : "You haven't made any bookings yet."
          }
          action={
            <Button asChild variant="gold">
              <Link to="/book">Book an appointment</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const future = new Date(booking.startsAt).getTime() > Date.now();
                  const cancellable =
                    future && (booking.status === "pending" || booking.status === "confirmed");
                  return (
                    <TableRow key={booking.id}>
                      <TableCell className="font-mono text-xs">{booking.reference}</TableCell>
                      <TableCell>
                        <div className="font-medium text-ink">{booking.serviceSnapshot.name}</div>
                        <div className="text-xs text-ink-400">
                          {booking.serviceSnapshot.durationMinutes} min
                        </div>
                      </TableCell>
                      <TableCell>
                        <DateTime value={booking.startsAt} showTime />
                      </TableCell>
                      <TableCell>{booking.staff?.name ?? "Any"}</TableCell>
                      <TableCell>
                        <StatusBadge kind="booking" status={booking.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="payment" status={booking.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={booking.totalPrice} emphasis />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/dashboard/bookings/${booking.reference}`}>
                              <Eye /> View
                            </Link>
                          </Button>
                          {cancellable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:text-danger"
                              disabled={cancelMutation.isPending}
                              onClick={() => handleCancel(booking.reference)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
