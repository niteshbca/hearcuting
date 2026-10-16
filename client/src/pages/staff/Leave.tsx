import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarPlus, Plus } from "lucide-react";
import { apiGetList, apiPatch, apiPost } from "@/services/api";
import type { StaffLeave } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DateTime } from "@/components/shared/DateTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const PAGE_SIZE = 15;

const leaveTypes = ["paid", "unpaid", "sick", "other"] as const;
const statuses = ["pending", "approved", "rejected"] as const;

const statusVariant: Record<string, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const leaveSchema = z
  .object({
    startDate: z.string().min(4, "Pick a start date"),
    endDate: z.string().min(4, "Pick an end date"),
    type: z.enum(leaveTypes),
    reason: z.string().max(500).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  });

type LeaveValues = z.infer<typeof leaveSchema>;

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function StaffLeavePage() {
  usePageMeta("Leave", "Request time off and track approval status.");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "owner" || user?.role === "manager";

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [review, setReview] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const listQuery = useQuery({
    queryKey: ["staff-leaves", { page, status, scoped: !canManage, staffId: user?.staffId }],
    queryFn: () =>
      apiGetList<StaffLeave>("/staff/leaves", {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
        staffId: canManage ? undefined : user?.staffId,
      }),
    placeholderData: keepPreviousData,
  });

  const { control, handleSubmit, reset } = useForm<LeaveValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: { startDate: todayKey(), endDate: todayKey(), type: "paid", reason: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: LeaveValues) =>
      apiPost<StaffLeave>("/staff/leaves", {
        startDate: values.startDate,
        endDate: values.endDate,
        type: values.type,
        reason: values.reason || undefined,
      }),
    onSuccess: () => {
      toast.success("Leave requested");
      setCreateOpen(false);
      reset({ startDate: todayKey(), endDate: todayKey(), type: "paid", reason: "" });
      void queryClient.invalidateQueries({ queryKey: ["staff-leaves"] });
    },
    onError: (error) =>
      toast.error("Couldn't submit request", { description: parseApiError(error).message }),
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: { id: string; status: "approved" | "rejected"; reviewNote?: string }) =>
      apiPatch(`/staff/leaves/${payload.id}`, { status: payload.status, reviewNote: payload.reviewNote }),
    onSuccess: () => {
      toast.success("Leave reviewed");
      setReview(null);
      setReviewNote("");
      void queryClient.invalidateQueries({ queryKey: ["staff-leaves"] });
    },
    onError: (error) =>
      toast.error("Couldn't review leave", { description: parseApiError(error).message }),
  });

  const leaves = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const forbidden = listQuery.isError && parseApiError(listQuery.error).code === "HTTP_403";

  function staffName(leave: StaffLeave): string {
    return typeof leave.staff === "object" && leave.staff ? leave.staff.name : "—";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        subtitle="Request time off and track approval status."
        actions={
          <Button variant="gold" onClick={() => setCreateOpen(true)}>
            <Plus /> Request leave
          </Button>
        }
      />

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {statuses.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {listQuery.isLoading ? (
        <DataTableSkeleton rows={5} columns={5} />
      ) : forbidden ? (
        <EmptyState
          icon={CalendarPlus}
          title="Leave history unavailable"
          description="Your role can submit leave requests, but a manager must view approval status for you."
          action={
            <Button variant="gold" onClick={() => setCreateOpen(true)}>
              <Plus /> Request leave
            </Button>
          }
        />
      ) : listQuery.isError ? (
        <ErrorState
          title="Couldn't load leave requests"
          message={parseApiError(listQuery.error).message}
          onRetry={() => listQuery.refetch()}
        />
      ) : leaves.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="No leave requests"
          description="Submit a request for time off."
          action={
            <Button variant="gold" onClick={() => setCreateOpen(true)}>
              <Plus /> Request leave
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && <TableHead>Staff</TableHead>}
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    {canManage && (
                      <TableCell className="font-medium text-ink">{staffName(leave)}</TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">
                      <DateTime value={leave.startDate} /> – <DateTime value={leave.endDate} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted" className="capitalize">
                        {leave.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-ink-500">{leave.reason || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[leave.status] ?? "muted"} className="capitalize">
                        {leave.status}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {leave.status === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={reviewMutation.isPending}
                              onClick={() => reviewMutation.mutate({ id: leave.id, status: "approved" })}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={reviewMutation.isPending}
                              onClick={() => {
                                setReviewNote("");
                                setReview({ id: leave.id, action: "rejected" });
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">{leave.reviewNote || "—"}</span>
                        )}
                      </TableCell>
                    )}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
            <DialogDescription>Owners and managers approve instantly; others await review.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((values) => createMutation.mutate(values))}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            <FormField
              control={control}
              name="startDate"
              label="Start date"
              required
              render={(field) => <Input type="date" {...field} />}
            />
            <FormField
              control={control}
              name="endDate"
              label="End date"
              required
              render={(field) => <Input type="date" {...field} />}
            />
            <FormField
              control={control}
              name="type"
              label="Type"
              required
              className="sm:col-span-2"
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((type) => (
                      <SelectItem key={type} value={type} className="capitalize">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={control}
              name="reason"
              label="Reason"
              className="sm:col-span-2"
              render={(field) => <Textarea rows={3} {...field} />}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>Optionally add a note explaining the rejection.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Textarea
              rows={3}
              value={reviewNote}
              placeholder="Reason (optional)"
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-danger hover:bg-danger/90"
              disabled={reviewMutation.isPending}
              onClick={() =>
                review && reviewMutation.mutate({ id: review.id, status: review.action, reviewNote: reviewNote || undefined })
              }
            >
              {reviewMutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
