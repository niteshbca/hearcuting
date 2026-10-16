import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";
import { apiGet, apiGetList, apiPatch } from "@/services/api";
import type { StaffLeave, StaffProfile, WeeklyScheduleEntry } from "@/types";
import { formatDate, initials, parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { FormField } from "@/components/shared/FormField";
import { DateRangePicker, type DateRangeValue } from "@/components/shared/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";

interface PerformanceResult {
  staffId: string;
  period: { from: string; to: string };
  completedServices: number;
  revenue: number;
  commission: number;
  appointments: { completed: number; cancelled: number; noShow: number; upcoming: number };
}

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number"),
  specialties: z.string().trim().max(400).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  salary: z.coerce.number().min(0).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

function defaultWeek(): WeeklyScheduleEntry[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    isWorking: day !== 0,
    start: "10:00",
    end: "20:00",
    breaks: [],
  }));
}

function normalizeWeek(entries: WeeklyScheduleEntry[] | undefined): WeeklyScheduleEntry[] {
  const base = defaultWeek();
  if (!entries?.length) return base;
  return base.map((day) => {
    const found = entries.find((e) => e.day === day.day);
    return found
      ? { ...day, ...found, breaks: found.breaks ?? [] }
      : day;
  });
}

function leaveVariant(status: StaffLeave["status"]): "warning" | "success" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

export default function AdminStaffDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = usePermission();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [range, setRange] = useState<DateRangeValue>({});
  const [leavesPage, setLeavesPage] = useState(1);
  const [week, setWeek] = useState<WeeklyScheduleEntry[]>(defaultWeek());

  const profileQuery = useQuery({
    queryKey: ["staff", id],
    queryFn: () => apiGet<StaffProfile>(`/staff/${id}`),
    enabled: Boolean(id),
  });

  usePageMeta(profileQuery.data?.name ?? "Staff member", "Schedule, leave and performance.");

  const performanceQuery = useQuery({
    queryKey: ["staff", id, "performance", range],
    queryFn: () =>
      apiGet<PerformanceResult>(`/staff/${id}/performance`, {
        from: range.from,
        to: range.to,
      }),
    enabled: Boolean(id) && tab === "performance",
  });

  const leavesQuery = useQuery({
    queryKey: ["staff", "leaves", id, leavesPage],
    queryFn: () =>
      apiGetList<StaffLeave>("/staff/leaves", { staffId: id, page: leavesPage, limit: 10 }),
    enabled: Boolean(id) && tab === "leaves",
    placeholderData: keepPreviousData,
  });

  const profile = profileQuery.data;

  useEffect(() => {
    if (profile) setWeek(normalizeWeek(profile.weeklySchedule));
  }, [profile]);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      phone: "",
      specialties: "",
      employmentType: "full_time",
    },
  });

  useEffect(() => {
    if (!profile || !editOpen) return;
    form.reset({
      name: profile.name,
      phone: profile.phone,
      specialties: (profile.specialties ?? []).join(", "),
      employmentType: profile.employmentType,
      salary: profile.salary,
      commissionPercent: profile.commissionPercent,
    });
  }, [profile, editOpen, form]);

  const updateMutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      apiPatch<StaffProfile>(`/staff/${id}`, {
        name: values.name,
        phone: values.phone,
        specialties: values.specialties
          ? values.specialties
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        employmentType: values.employmentType,
        salary: values.salary,
        commissionPercent: values.commissionPercent,
      }),
    onSuccess: () => {
      toast.success("Profile updated");
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => {
      toast.error("Couldn't update profile", { description: parseApiError(error).message });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      apiPatch<StaffProfile>(`/staff/${id}/schedule`, { weeklySchedule: week }),
    onSuccess: () => {
      toast.success("Schedule saved");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => {
      toast.error("Couldn't save schedule", { description: parseApiError(error).message });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      apiPatch<StaffProfile>(`/staff/${id}/status`, { isActive }),
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => {
      toast.error("Couldn't update status", { description: parseApiError(error).message });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: ({ leaveId, status }: { leaveId: string; status: "approved" | "rejected" }) =>
      apiPatch<StaffLeave>(`/staff/leaves/${leaveId}`, { status }),
    onSuccess: () => {
      toast.success("Leave request updated");
      void queryClient.invalidateQueries({ queryKey: ["staff", "leaves", id] });
    },
    onError: (error) => {
      toast.error("Couldn't review leave", { description: parseApiError(error).message });
    },
  });

  async function handleStatusToggle(next: boolean) {
    if (!next) {
      const ok = await confirm({
        title: `Deactivate ${profile?.name ?? "this member"}?`,
        description: "They will be signed out and hidden from booking.",
        confirmText: "Deactivate",
        destructive: true,
      });
      if (!ok) return;
    }
    statusMutation.mutate(next);
  }

  function updateDay(day: number, patch: Partial<WeeklyScheduleEntry>) {
    setWeek((prev) => prev.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry)));
  }

  const leaves = leavesQuery.data?.data ?? [];
  const pendingLeaves = useMemo(() => leaves.filter((l) => l.status === "pending"), [leaves]);

  if (profileQuery.isLoading) return <LoadingState label="Loading staff member…" />;
  if (profileQuery.isError || !profile) {
    return (
      <ErrorState
        title="Couldn't load this staff member"
        message={profileQuery.error ? parseApiError(profileQuery.error).message : undefined}
        onRetry={() => profileQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/admin/staff">
            <ArrowLeft /> All staff
          </Link>
        </Button>
        <PageHeader
          title={profile.name}
          subtitle={`${profile.role} · joined ${formatDate(profile.joiningDate ?? profile.createdAt)}`}
          actions={
            can("staff.manage") && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit profile
              </Button>
            )
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink font-display text-lg text-white">
          {initials(profile.name)}
        </span>
        <div className="space-y-0.5 text-sm text-ink-500">
          <div>{profile.email}</div>
          <div>{profile.phone}</div>
        </div>
        <Badge variant="gold" className="capitalize">
          {profile.role}
        </Badge>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-400">{profile.isActive ? "Active" : "Inactive"}</span>
          <Switch
            checked={profile.isActive}
            disabled={!can("staff.manage") || statusMutation.isPending}
            onCheckedChange={handleStatusToggle}
            aria-label="Toggle active status"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="leaves">
            Leaves
            {pendingLeaves.length > 0 && (
              <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 text-xs text-warning">
                {pendingLeaves.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Employment</span>
                  <span className="capitalize text-ink">{profile.employmentType.replace(/_/g, " ")}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Commission</span>
                  <span className="text-ink">
                    {typeof profile.commissionPercent === "number"
                      ? `${profile.commissionPercent}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Salary</span>
                  <span className="text-ink">
                    {typeof profile.salary === "number" ? <Money amount={profile.salary} /> : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Services assigned</span>
                  <span className="text-ink">{profile.services?.length ?? 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Specialties</CardTitle>
              </CardHeader>
              <CardContent>
                {profile.specialties?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.specialties.map((specialty) => (
                      <Badge key={specialty} variant="outline">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-400">No specialties listed.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <DateRangePicker value={range} onChange={setRange} className="max-w-md" />
          {performanceQuery.isLoading ? (
            <LoadingState label="Loading performance…" />
          ) : performanceQuery.isError ? (
            <ErrorState
              title="Couldn't load performance"
              message={parseApiError(performanceQuery.error).message}
              onRetry={() => performanceQuery.refetch()}
            />
          ) : performanceQuery.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Completed services"
                  value={performanceQuery.data.completedServices}
                  accent="gold"
                />
                <StatCard
                  label="Revenue"
                  value={<Money amount={performanceQuery.data.revenue} />}
                  accent="success"
                />
                <StatCard
                  label="Commission"
                  value={<Money amount={performanceQuery.data.commission} />}
                  accent="ink"
                />
                <StatCard
                  label="Upcoming"
                  value={performanceQuery.data.appointments.upcoming}
                  accent="gold"
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Appointments · {performanceQuery.data.period.from} → {performanceQuery.data.period.to}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-ink-500">Completed</span>
                    <span className="text-ink">{performanceQuery.data.appointments.completed}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-ink-500">Cancelled</span>
                    <span className="text-ink">{performanceQuery.data.appointments.cancelled}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-ink-500">No-shows</span>
                    <span className="text-ink">{performanceQuery.data.appointments.noShow}</span>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {week.map((day) => (
                <div
                  key={day.day}
                  className="grid gap-3 border-b border-border pb-3 last:border-0 sm:grid-cols-[10rem_5rem_1fr_1fr] sm:items-center"
                >
                  <span className="text-sm font-medium text-ink">{DAY_NAMES[day.day]}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={day.isWorking}
                      disabled={!can("staff.manage")}
                      onCheckedChange={(value) => updateDay(day.day, { isWorking: value })}
                      aria-label={`${DAY_NAMES[day.day]} working`}
                    />
                    <span className="text-xs text-ink-400">{day.isWorking ? "Working" : "Off"}</span>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`start-${day.day}`} className="text-xs text-ink-400">
                      Start
                    </Label>
                    <Input
                      id={`start-${day.day}`}
                      type="time"
                      value={day.start}
                      disabled={!day.isWorking || !can("staff.manage")}
                      onChange={(e) => updateDay(day.day, { start: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`end-${day.day}`} className="text-xs text-ink-400">
                      End
                    </Label>
                    <Input
                      id={`end-${day.day}`}
                      type="time"
                      value={day.end}
                      disabled={!day.isWorking || !can("staff.manage")}
                      onChange={(e) => updateDay(day.day, { end: e.target.value })}
                    />
                  </div>
                </div>
              ))}
              {can("staff.manage") && (
                <div className="flex justify-end pt-2">
                  <Button
                    variant="gold"
                    disabled={scheduleMutation.isPending}
                    onClick={() => scheduleMutation.mutate()}
                  >
                    {scheduleMutation.isPending ? "Saving…" : "Save schedule"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves" className="space-y-4">
          {leavesQuery.isLoading ? (
            <LoadingState label="Loading leave requests…" />
          ) : leavesQuery.isError ? (
            <ErrorState
              title="Couldn't load leave requests"
              message={parseApiError(leavesQuery.error).message}
              onRetry={() => leavesQuery.refetch()}
            />
          ) : leaves.length === 0 ? (
            <EmptyState title="No leave requests" description="This member hasn't requested any leave." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map((leave) => (
                      <TableRow key={leave.id}>
                        <TableCell>
                          {formatDate(leave.startDate)} → {formatDate(leave.endDate)}
                        </TableCell>
                        <TableCell className="capitalize">{leave.type}</TableCell>
                        <TableCell className="max-w-[16rem] truncate text-sm text-ink-500">
                          {leave.reason || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={leaveVariant(leave.status)} className="capitalize">
                            {leave.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {leave.status === "pending" && can("staff.manage") ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-success hover:text-success"
                                disabled={leaveMutation.isPending}
                                onClick={() => leaveMutation.mutate({ leaveId: leave.id, status: "approved" })}
                              >
                                <Check /> Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:text-danger"
                                disabled={leaveMutation.isPending}
                                onClick={() => leaveMutation.mutate({ leaveId: leave.id, status: "rejected" })}
                              >
                                <X /> Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {leavesQuery.data?.meta && leavesQuery.data.meta.totalPages > 1 && (
            <Pagination
              page={leavesQuery.data.meta.page}
              totalPages={leavesQuery.data.meta.totalPages}
              onPageChange={setLeavesPage}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                label="Full name"
                required
                render={(field) => <Input {...field} />}
              />
              <FormField
                control={form.control}
                name="phone"
                label="Phone"
                required
                render={(field) => <Input {...field} />}
              />
            </div>
            <FormField
              control={form.control}
              name="specialties"
              label="Specialties"
              description="Comma-separated"
              render={(field) => <Input {...field} value={field.value ?? ""} />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="employmentType"
                label="Employment"
                render={(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Employment type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormField
                control={form.control}
                name="commissionPercent"
                label="Commission %"
                render={(field) => <Input type="number" min={0} max={100} step="1" {...field} />}
              />
            </div>
            <FormField
              control={form.control}
              name="salary"
              label="Salary"
              render={(field) => <Input type="number" min={0} step="1" {...field} />}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
