import { useState } from "react";
import { Link } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Copy, UserPlus, Users } from "lucide-react";
import { apiGetList, apiPatch, apiPost } from "@/services/api";
import type { StaffProfile } from "@/types";
import { initials, parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Money } from "@/components/shared/Money";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

const STAFF_ROLES = ["barber", "manager", "receptionist", "accountant"] as const;
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract"] as const;

const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number"),
  role: z.enum(STAFF_ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  specialties: z.string().trim().max(400).optional(),
  salary: z.coerce.number().min(0).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
});

type CreateStaffValues = z.infer<typeof createStaffSchema>;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const PAGE_SIZE = 12;

function employmentLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export default function AdminStaffPage() {
  usePageMeta("Staff", "Team, schedules and availability.");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [invite, setInvite] = useState<{ name: string; password: string } | null>(null);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = usePermission();

  const form = useForm<CreateStaffValues>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "barber",
      employmentType: "full_time",
      specialties: "",
    },
  });

  const query = useQuery({
    queryKey: ["staff", { page, search, status, role }],
    queryFn: () =>
      apiGetList<StaffProfile>("/staff", {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        isActive: status === "all" ? undefined : status === "active",
        role: role === "all" ? undefined : role,
      }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateStaffValues) =>
      apiPost<{ staff: StaffProfile; invitePassword: string }>("/staff", {
        name: values.name,
        email: values.email,
        phone: values.phone,
        role: values.role,
        employmentType: values.employmentType,
        specialties: values.specialties
          ? values.specialties
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        salary: values.salary,
        commissionPercent: values.commissionPercent,
      }),
    onSuccess: (result) => {
      setCreateOpen(false);
      form.reset();
      setInvite({ name: result.staff.name, password: result.invitePassword });
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => {
      toast.error("Couldn't add staff member", { description: parseApiError(error).message });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<StaffProfile>(`/staff/${id}/status`, { isActive }),
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => {
      toast.error("Couldn't update status", { description: parseApiError(error).message });
    },
  });

  async function handleToggle(member: StaffProfile, next: boolean) {
    if (!next) {
      const ok = await confirm({
        title: `Deactivate ${member.name}?`,
        description: "They will be signed out and hidden from booking. Their history is kept.",
        confirmText: "Deactivate",
        destructive: true,
      });
      if (!ok) return;
    }
    statusMutation.mutate({ id: member.id, isActive: next });
  }

  const staff = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = search !== "" || status !== "all" || role !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        subtitle="Team, schedules and availability."
        actions={
          can("staff.manage") && (
            <Button variant="gold" size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus /> Add staff
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <TabsList>
            {STATUS_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value}>
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={role}
            onValueChange={(value) => {
              setRole(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-44" aria-label="Filter by role">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search name, email, phone…"
            ariaLabel="Search staff"
            className="sm:w-72"
          />
        </div>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={6} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load staff"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff found"
          description={filtered ? "Try a different filter or search term." : "Add your first team member."}
          action={
            can("staff.manage") && (
              <Button variant="gold" onClick={() => setCreateOpen(true)}>
                <UserPlus /> Add staff
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Employment</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                          {initials(member.name)}
                        </span>
                        <div>
                          <div className="font-medium text-ink">{member.name}</div>
                          <Badge variant="gold" className="mt-0.5 capitalize">
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{member.email}</div>
                      <div className="text-xs text-ink-400">{member.phone}</div>
                    </TableCell>
                    <TableCell className="capitalize">{employmentLabel(member.employmentType)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {typeof member.commissionPercent === "number"
                        ? `${member.commissionPercent}%`
                        : "—"}
                      {typeof member.salary === "number" && (
                        <div className="text-xs text-ink-400">
                          <Money amount={member.salary} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-ink-400">
                          {member.isActive ? "Active" : "Inactive"}
                        </span>
                        <Switch
                          checked={member.isActive}
                          disabled={!can("staff.manage") || statusMutation.isPending}
                          onCheckedChange={(next) => handleToggle(member, next)}
                          aria-label={`Toggle ${member.name}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/admin/staff/${member.id}`}>View</Link>
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

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) form.reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add staff member</DialogTitle>
            <DialogDescription>
              An account is created and a one-time password is generated for them.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                label="Full name"
                required
                render={(field) => <Input placeholder="Alex Barber" {...field} />}
              />
              <FormField
                control={form.control}
                name="phone"
                label="Phone"
                required
                render={(field) => <Input placeholder="+91 98765 43210" {...field} />}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              label="Email"
              required
              render={(field) => <Input type="email" placeholder="alex@salon.com" {...field} />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="role"
                label="Role"
                required
                render={(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
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
                          {employmentLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="specialties"
              label="Specialties"
              description="Comma-separated, e.g. fades, colour, beard styling"
              render={(field) => <Input {...field} value={field.value ?? ""} />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="salary"
                label="Salary"
                render={(field) => <Input type="number" min={0} step="1" {...field} />}
              />
              <FormField
                control={form.control}
                name="commissionPercent"
                label="Commission %"
                render={(field) => (
                  <Input type="number" min={0} max={100} step="1" {...field} />
                )}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Add staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(invite)} onOpenChange={(open) => !open && setInvite(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Staff account created</DialogTitle>
            <DialogDescription>
              Share this one-time password with {invite?.name}. They must change it after first
              sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-cream/60 p-4">
            <code className="font-mono text-base tracking-wide text-ink">{invite?.password}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (invite) {
                  void navigator.clipboard?.writeText(invite.password);
                  toast.success("Copied to clipboard");
                }
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button variant="gold" onClick={() => setInvite(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
