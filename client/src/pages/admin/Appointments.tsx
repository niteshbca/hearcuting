import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CalendarX2, MoreHorizontal, UserRoundCog } from "lucide-react";
import { apiGetList, apiPatch } from "@/services/api";
import type { Appointment, BookingStatus, PaymentStatus, StaffProfile } from "@/types";
import { personName } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/sonner";
import { parseApiError } from "@/lib/utils";

interface AppointmentRow extends Appointment {
  staff?: StaffProfile | string | null;
}

const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show", "completed"],
  in_progress: ["completed", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Confirm",
  confirmed: "Start",
  in_progress: "Complete",
  completed: "Completed",
  cancelled: "Cancel",
  no_show: "Mark no-show",
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const PAGE_SIZE = 15;

export default function AdminAppointmentsPage() {
  usePageMeta("Appointments", "Today's schedule and upcoming bookings.");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRangeValue>({});
  const [staffId, setStaffId] = useState("all");
  const [assignTarget, setAssignTarget] = useState<AppointmentRow | null>(null);
  const [assignStaffId, setAssignStaffId] = useState("");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = usePermission();

  const query = useQuery({
    queryKey: ["appointments", "admin", { page, status, search, range, staffId }],
    queryFn: () =>
      apiGetList<AppointmentRow>("/appointments", {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
        search: search || undefined,
        from: range.from,
        to: range.to,
        staffId: staffId === "all" ? undefined : staffId,
        sort: "-startsAt",
      }),
    placeholderData: keepPreviousData,
  });

  const staffQuery = useQuery({
    queryKey: ["staff", "picker", { isActive: true }],
    queryFn: () => apiGetList<StaffProfile>("/staff", { isActive: true, limit: 100 }),
    enabled: can("staff.view"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: BookingStatus }) =>
      apiPatch<Appointment>(`/appointments/${id}/status`, { status: next }),
    onSuccess: () => {
      toast.success("Appointment updated");
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => {
      toast.error("Couldn't update status", { description: parseApiError(error).message });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) =>
      apiPatch<Appointment>(`/appointments/${id}/assign`, { staffId: to }),
    onSuccess: () => {
      toast.success("Appointment reassigned");
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setAssignTarget(null);
      setAssignStaffId("");
    },
    onError: (error) => {
      toast.error("Couldn't assign staff", { description: parseApiError(error).message });
    },
  });

  async function handleStatus(row: AppointmentRow, next: BookingStatus) {
    const destructive = next === "cancelled" || next === "no_show";
    const ok = await confirm({
      title: `${destructive ? "Cancel" : "Update"} this appointment?`,
      description: `Reference ${row.reference} will be marked as "${next.replace("_", " ")}".`,
      confirmText: destructive ? "Yes, continue" : "Update",
      destructive,
    });
    if (ok) statusMutation.mutate({ id: row.id, next });
  }

  function handleOpenAssign(row: AppointmentRow) {
    setAssignTarget(row);
    setAssignStaffId(
      row.staff && typeof row.staff === "object" ? row.staff.id : (row.staff ?? ""),
    );
  }

  const appointments = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = search !== "" || status !== "all" || Boolean(range.from || range.to) || staffId !== "all";
  const staffOptions = staffQuery.data?.data ?? [];

  const total = useMemo(() => meta?.total ?? 0, [meta]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        subtitle={total > 0 ? `${total} bookings match the current view.` : "Today's schedule and upcoming bookings."}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
            placeholder="Search reference, customer…"
            ariaLabel="Search appointments"
            className="lg:w-72"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <DateRangePicker
            value={range}
            onChange={(value) => {
              setRange(value);
              setPage(1);
            }}
            className="flex-1"
          />
          {can("staff.view") && (
            <Select
              value={staffId}
              onValueChange={(value) => {
                setStaffId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-52" aria-label="Filter by staff">
                <SelectValue placeholder="All staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {staffOptions.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={8} columns={7} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load appointments"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="No appointments found"
          description={filtered ? "Try a different filter or search term." : "The schedule is clear."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
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
                {appointments.map((row) => {
                  const nextStatuses = STATUS_TRANSITIONS[row.status] ?? [];
                  const customerName =
                    personName(row.customer) || row.guest?.name || "Walk-in";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                      <TableCell>
                        <div className="font-medium text-ink">{customerName}</div>
                        <div className="text-xs text-ink-400">
                          {row.guest?.phone || (row.customer && typeof row.customer === "object" ? row.customer.phone : "")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{row.serviceSnapshot?.name ?? "—"}</div>
                        <div className="text-xs text-ink-400">{row.serviceSnapshot?.durationMinutes} min</div>
                      </TableCell>
                      <TableCell>
                        <DateTime value={row.startsAt} showTime />
                      </TableCell>
                      <TableCell>{personName(row.staff) || "Any"}</TableCell>
                      <TableCell>
                        <StatusBadge kind="booking" status={row.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="payment" status={row.paymentStatus as PaymentStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={row.totalPrice} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/admin/customers${row.customer && typeof row.customer === "object" ? `/${row.customer.id}` : ""}`}>
                              View
                            </Link>
                          </Button>
                          {(can("appointments.update") || can("appointments.assign")) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Appointment actions">
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Change status</DropdownMenuLabel>
                                {nextStatuses.length === 0 ? (
                                  <DropdownMenuItem disabled>No further transitions</DropdownMenuItem>
                                ) : (
                                  nextStatuses.map((next) => (
                                    <DropdownMenuItem
                                      key={next}
                                      disabled={!can("appointments.update") || statusMutation.isPending}
                                      className={
                                        next === "cancelled" || next === "no_show"
                                          ? "text-danger focus:text-danger"
                                          : undefined
                                      }
                                      onClick={() => handleStatus(row, next)}
                                    >
                                      {STATUS_LABELS[next]}
                                    </DropdownMenuItem>
                                  ))
                                )}
                                {can("appointments.assign") && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleOpenAssign(row)}>
                                      <UserRoundCog /> Reassign staff
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <Dialog open={Boolean(assignTarget)} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign staff</DialogTitle>
            <DialogDescription>
              Booking {assignTarget?.reference} · {assignTarget?.serviceSnapshot?.name}
            </DialogDescription>
          </DialogHeader>
          {staffQuery.isError ? (
            <p className="text-sm text-danger">
              Couldn&apos;t load the staff list: {parseApiError(staffQuery.error).message}
            </p>
          ) : (
            <Select value={assignStaffId} onValueChange={setAssignStaffId}>
              <SelectTrigger aria-label="Select staff member">
                <SelectValue placeholder="Choose a staff member" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} · {member.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={!assignStaffId || assignMutation.isPending || staffQuery.isLoading}
              onClick={() => {
                if (assignTarget && assignStaffId) {
                  assignMutation.mutate({ id: assignTarget.id, to: assignStaffId });
                }
              }}
            >
              {assignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
