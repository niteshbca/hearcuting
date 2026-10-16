import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreditCard, Pencil, Plus, RefreshCw, Ticket, Trash2, Users } from "lucide-react";
import { apiGetList, apiPatch, apiPost } from "@/services/api";
import type { CustomerProfile, Membership, MembershipPlan } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { FormField } from "@/components/shared/FormField";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DateTime } from "@/components/shared/DateTime";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const PAGE_SIZE = 15;

const memberStatuses = ["active", "expired", "exhausted", "cancelled"] as const;

type MemberStatus = (typeof memberStatuses)[number];

const statusVariant: Record<MemberStatus, "success" | "warning" | "muted" | "danger"> = {
  active: "success",
  expired: "warning",
  exhausted: "muted",
  cancelled: "danger",
};

const planSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  type: z.enum(["membership", "package"]),
  description: z.string().max(2000).optional(),
  price: z.coerce.number().min(0),
  validityDays: z.coerce.number().int().min(1).max(3650),
  credits: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean(),
  sortWeight: z.coerce.number().int().optional(),
});

type PlanValues = z.infer<typeof planSchema>;

const purchaseSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  planId: z.string().min(1, "Select a plan"),
  paidAmount: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(["cash", "upi", "card", "online", "voucher"]).optional(),
  startDate: z.string().optional(),
});

type PurchaseValues = z.infer<typeof purchaseSchema>;

const redeemSchema = z.object({
  serviceName: z.string().trim().min(1, "Enter or pick a service").max(120),
  applyDiscount: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

type RedeemValues = z.infer<typeof redeemSchema>;

const renewSchema = z.object({
  paidAmount: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(["cash", "upi", "card", "online", "voucher"]).optional(),
});

type RenewValues = z.infer<typeof renewSchema>;

interface IncludeRow {
  serviceName: string;
  limitTotal: number;
  discountPercent?: number;
}

interface Redemption {
  id: string;
  customer?: { name?: string } | string;
  membership?: { name?: string; code?: string } | string;
  service?: { name?: string } | string;
  value: number;
  notes?: string;
  createdAt: string;
}

const EMPTY_PLAN: PlanValues = {
  name: "",
  type: "package",
  description: "",
  price: 0,
  validityDays: 90,
  credits: 0,
  isActive: true,
  sortWeight: 0,
};

export default function AdminMembershipsPage() {
  usePageMeta("Memberships", "Sell packages, manage plans and redeem sessions.");
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("members");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [redemptionPage, setRedemptionPage] = useState(1);

  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [includes, setIncludes] = useState<IncludeRow[]>([]);

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [redeemTarget, setRedeemTarget] = useState<Membership | null>(null);
  const [renewTarget, setRenewTarget] = useState<Membership | null>(null);

  const membersQuery = useQuery({
    queryKey: ["memberships", { page, status }],
    queryFn: () =>
      apiGetList<Membership>("/memberships", {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
      }),
    placeholderData: keepPreviousData,
  });

  const plansQuery = useQuery({
    queryKey: ["membership-plans"],
    queryFn: () => apiGetList<MembershipPlan>("/memberships/plans"),
  });

  const redemptionsQuery = useQuery({
    queryKey: ["membership-redemptions", { redemptionPage }],
    queryFn: () => apiGetList<Redemption>("/memberships/redemptions", { page: redemptionPage, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const planForm = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: EMPTY_PLAN,
  });

  const purchaseForm = useForm<PurchaseValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { customerId: "", planId: "", paidAmount: 0, paymentMethod: "cash", startDate: "" },
  });

  const redeemForm = useForm<RedeemValues>({
    resolver: zodResolver(redeemSchema),
    defaultValues: { serviceName: "", applyDiscount: true, notes: "" },
  });

  const renewForm = useForm<RenewValues>({
    resolver: zodResolver(renewSchema),
    defaultValues: { paidAmount: 0, paymentMethod: "cash" },
  });

  const [customerSearch, setCustomerSearch] = useState("");
  const customersQuery = useQuery({
    queryKey: ["customers", "membership-picker", customerSearch],
    queryFn: () => apiGetList<CustomerProfile>("/customers", { search: customerSearch, limit: 8 }),
    enabled: purchaseOpen && customerSearch.trim().length > 1,
  });
  const selectedCustomerId = purchaseForm.watch("customerId");
  const selectedCustomer = customersQuery.data?.data.find((c) => c.id === selectedCustomerId);

  useEffect(() => {
    if (!planOpen) return;
    if (editingPlan) {
      planForm.reset({
        name: editingPlan.name,
        type: editingPlan.type,
        description: editingPlan.description ?? "",
        price: editingPlan.price,
        validityDays: editingPlan.validityDays,
        credits: editingPlan.credits ?? 0,
        isActive: editingPlan.isActive,
        sortWeight: editingPlan.sortWeight,
      });
      setIncludes(
        editingPlan.includes.map((inc) => ({
          serviceName: inc.serviceName ?? "",
          limitTotal: inc.limitTotal,
          discountPercent: inc.discountPercent,
        })),
      );
    } else {
      planForm.reset(EMPTY_PLAN);
      setIncludes([]);
    }
  }, [planOpen, editingPlan, planForm]);

  useEffect(() => {
    if (!redeemTarget) return;
    redeemForm.reset({ serviceName: "", applyDiscount: true, notes: "" });
  }, [redeemTarget, redeemForm]);

  const planMutation = useMutation({
    mutationFn: (values: PlanValues) => {
      const payload = {
        name: values.name,
        type: values.type,
        description: values.description || undefined,
        price: values.price,
        validityDays: values.validityDays,
        credits: values.credits ?? 0,
        isActive: values.isActive,
        sortWeight: values.sortWeight ?? 0,
        includes: includes
          .filter((row) => row.serviceName.trim())
          .map((row) => ({
            serviceName: row.serviceName.trim(),
            limitTotal: Math.max(1, row.limitTotal),
            discountPercent: row.discountPercent,
          })),
      };
      return editingPlan
        ? apiPatch<MembershipPlan>(`/memberships/plans/${editingPlan.id}`, payload)
        : apiPost<MembershipPlan>("/memberships/plans", payload);
    },
    onSuccess: () => {
      toast.success(editingPlan ? "Plan updated" : "Plan created");
      setPlanOpen(false);
      setEditingPlan(null);
      void queryClient.invalidateQueries({ queryKey: ["membership-plans"] });
    },
    onError: (error) =>
      toast.error("Couldn't save plan", { description: parseApiError(error).message }),
  });

  const purchaseMutation = useMutation({
    mutationFn: (values: PurchaseValues) =>
      apiPost<{ membership: Membership }>("/memberships", {
        customerId: values.customerId,
        planId: values.planId,
        paidAmount: values.paidAmount || undefined,
        paymentMethod: values.paymentMethod,
        startDate: values.startDate || undefined,
      }),
    onSuccess: () => {
      toast.success("Membership sold");
      setPurchaseOpen(false);
      purchaseForm.reset({ customerId: "", planId: "", paidAmount: 0, paymentMethod: "cash", startDate: "" });
      void queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (error) =>
      toast.error("Couldn't sell membership", { description: parseApiError(error).message }),
  });

  const redeemMutation = useMutation({
    mutationFn: (values: RedeemValues) =>
      apiPost(`/memberships/${redeemTarget?.id}/redeem`, {
        serviceName: values.serviceName,
        applyDiscount: values.applyDiscount,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast.success("Session redeemed");
      setRedeemTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["memberships"] });
      void queryClient.invalidateQueries({ queryKey: ["membership-redemptions"] });
    },
    onError: (error) =>
      toast.error("Couldn't redeem", { description: parseApiError(error).message }),
  });

  const renewMutation = useMutation({
    mutationFn: (values: RenewValues) =>
      apiPost(`/memberships/renew/${renewTarget?.id}`, {
        paidAmount: values.paidAmount || undefined,
        paymentMethod: values.paymentMethod,
      }),
    onSuccess: () => {
      toast.success("Membership renewed");
      setRenewTarget(null);
      renewForm.reset({ paidAmount: 0, paymentMethod: "cash" });
      void queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (error) =>
      toast.error("Couldn't renew", { description: parseApiError(error).message }),
  });

  const members = membersQuery.data?.data ?? [];
  const meta = membersQuery.data?.meta;
  const plans = plansQuery.data?.data ?? [];
  const redemptions = redemptionsQuery.data?.data ?? [];
  const redemptionMeta = redemptionsQuery.data?.meta;

  function openCreatePlan() {
    setEditingPlan(null);
    setPlanOpen(true);
  }

  function openEditPlan(plan: MembershipPlan) {
    setEditingPlan(plan);
    setPlanOpen(true);
  }

  function customerName(customer: Membership["customer"]): string {
    return typeof customer === "object" && customer ? (customer.name ?? "—") : "—";
  }

  function planName(plan: Membership["plan"]): string {
    return typeof plan === "object" && plan ? plan.name : "—";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memberships"
        subtitle="Sell packages, manage plans and redeem sessions."
        actions={
          tab === "plans" ? (
            <Button variant="gold" onClick={openCreatePlan}>
              <Plus /> New plan
            </Button>
          ) : (
            <Button variant="gold" onClick={() => setPurchaseOpen(true)}>
              <Plus /> Sell membership
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {memberStatuses.map((s) => (
                  <TabsTrigger key={s} value={s} className="capitalize">
                    {s}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search…"
              ariaLabel="Search memberships"
              className="lg:w-64"
            />
          </div>
          {membersQuery.isLoading ? (
            <DataTableSkeleton rows={6} columns={6} />
          ) : membersQuery.isError ? (
            <ErrorState
              title="Couldn't load memberships"
              message={parseApiError(membersQuery.error).message}
              onRetry={() => membersQuery.refetch()}
            />
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No memberships"
              description="Sell a package or membership to get started."
              action={
                <Button variant="gold" onClick={() => setPurchaseOpen(true)}>
                  <Plus /> Sell membership
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Valid until</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium text-ink">
                          {customerName(member.customer)}
                        </TableCell>
                        <TableCell className="text-ink-500">
                          {planName(member.plan) !== "—" ? planName(member.plan) : member.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-ink-500">{member.code}</TableCell>
                        <TableCell>
                          <DateTime value={member.validUntil} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{member.credits}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[member.status]}>{member.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={member.status !== "active"}
                              onClick={() => setRedeemTarget(member)}
                            >
                              <Ticket className="h-4 w-4" /> Redeem
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                renewForm.reset({ paidAmount: member.price, paymentMethod: "cash" });
                                setRenewTarget(member);
                              }}
                            >
                              <RefreshCw className="h-4 w-4" /> Renew
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
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          {plansQuery.isLoading ? (
            <DataTableSkeleton rows={4} columns={5} />
          ) : plansQuery.isError ? (
            <ErrorState
              title="Couldn't load plans"
              message={parseApiError(plansQuery.error).message}
              onRetry={() => plansQuery.refetch()}
            />
          ) : plans.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No plans yet"
              description="Create a package or membership plan to sell."
              action={
                <Button variant="gold" onClick={openCreatePlan}>
                  <Plus /> New plan
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle>{plan.name}</CardTitle>
                      <p className="mt-1 text-xs capitalize text-ink-500">
                        {plan.type} · {plan.validityDays} days
                      </p>
                    </div>
                    <Badge variant={plan.isActive ? "success" : "muted"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="font-display text-2xl text-ink">
                      <Money amount={plan.price} emphasis />
                    </p>
                    {plan.includes.length > 0 && (
                      <ul className="space-y-1 text-sm text-ink-500">
                        {plan.includes.map((inc, index) => (
                          <li key={index}>
                            {inc.serviceName ?? inc.service} · {inc.limitTotal} session
                            {inc.limitTotal === 1 ? "" : "s"}
                          </li>
                        ))}
                      </ul>
                    )}
                    {plan.credits ? (
                      <p className="text-sm text-ink-500">{plan.credits} credits</p>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => openEditPlan(plan)}>
                      <Pencil className="h-4 w-4" /> Edit plan
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-4">
          {redemptionsQuery.isLoading ? (
            <DataTableSkeleton rows={6} columns={5} />
          ) : redemptionsQuery.isError ? (
            <ErrorState
              title="Couldn't load redemptions"
              message={parseApiError(redemptionsQuery.error).message}
              onRetry={() => redemptionsQuery.refetch()}
            />
          ) : redemptions.length === 0 ? (
            <EmptyState icon={Ticket} title="No redemptions" description="Redeemed sessions will show here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Membership</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((redemption) => (
                      <TableRow key={redemption.id}>
                        <TableCell className="font-medium text-ink">
                          {typeof redemption.customer === "object" && redemption.customer
                            ? redemption.customer.name
                            : "—"}
                        </TableCell>
                        <TableCell className="text-ink-500">
                          {typeof redemption.membership === "object" && redemption.membership
                            ? `${redemption.membership.name ?? ""} ${redemption.membership.code ?? ""}`.trim()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-ink-500">
                          {typeof redemption.service === "object" && redemption.service
                            ? redemption.service.name
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money amount={redemption.value} />
                        </TableCell>
                        <TableCell>
                          <DateTime value={redemption.createdAt} showTime />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {redemptionMeta && redemptionMeta.totalPages > 1 && (
            <Pagination
              page={redemptionMeta.page}
              totalPages={redemptionMeta.totalPages}
              onPageChange={setRedemptionPage}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit plan" : "New plan"}</DialogTitle>
            <DialogDescription>Define pricing, validity and included sessions.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={planForm.handleSubmit((values) => planMutation.mutate(values))}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            <FormField
              control={planForm.control}
              name="name"
              label="Name"
              required
              className="sm:col-span-2"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={planForm.control}
              name="type"
              label="Type"
              required
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="package">Package</SelectItem>
                    <SelectItem value="membership">Membership</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={planForm.control}
              name="price"
              label="Price"
              required
              render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
            />
            <FormField
              control={planForm.control}
              name="validityDays"
              label="Validity (days)"
              required
              render={(field) => <Input type="number" min={1} step="1" {...field} />}
            />
            <FormField
              control={planForm.control}
              name="credits"
              label="Credits"
              render={(field) => <Input type="number" min={0} step="1" {...field} />}
            />
            <FormField
              control={planForm.control}
              name="description"
              label="Description"
              className="sm:col-span-2"
              render={(field) => <Textarea rows={2} {...field} />}
            />
            <FormField
              control={planForm.control}
              name="isActive"
              className="sm:col-span-2"
              render={(field) => (
                <label className="flex items-center gap-3 text-sm text-ink-700">
                  <Switch checked={field.value} onCheckedChange={(checked) => field.onChange(checked)} />
                  Available for sale
                </label>
              )}
            />

            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Included sessions</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIncludes((rows) => [...rows, { serviceName: "", limitTotal: 1 }])}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              {includes.length === 0 ? (
                <p className="text-xs text-ink-400">
                  Optional. Add service names with session counts for package plans.
                </p>
              ) : (
                <div className="space-y-2">
                  {includes.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Service name"
                        value={row.serviceName}
                        onChange={(e) =>
                          setIncludes((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, serviceName: e.target.value } : r)),
                          )
                        }
                      />
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="w-24"
                        aria-label="Sessions"
                        value={row.limitTotal}
                        onChange={(e) =>
                          setIncludes((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, limitTotal: Number(e.target.value) } : r,
                            ),
                          )
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="w-24"
                        aria-label="Discount percent"
                        placeholder="%"
                        value={row.discountPercent ?? ""}
                        onChange={(e) =>
                          setIncludes((rows) =>
                            rows.map((r, i) =>
                              i === index
                                ? { ...r, discountPercent: e.target.value === "" ? undefined : Number(e.target.value) }
                                : r,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove include"
                        onClick={() => setIncludes((rows) => rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={planMutation.isPending}>
                {planMutation.isPending ? "Saving…" : editingPlan ? "Save changes" : "Create plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Purchase dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sell membership</DialogTitle>
            <DialogDescription>Create a membership and its purchase invoice.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={purchaseForm.handleSubmit((values) => purchaseMutation.mutate(values))}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={purchaseForm.control}
              name="customerId"
              label="Customer"
              required
              render={() => (
                <div className="space-y-2">
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{selectedCustomer.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => purchaseForm.setValue("customerId", "")}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <SearchInput
                        value={customerSearch}
                        onChange={setCustomerSearch}
                        placeholder="Search customer by name, phone or email…"
                      />
                      {customersQuery.data && customersQuery.data.data.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                          {customersQuery.data.data.map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50"
                              onClick={() => purchaseForm.setValue("customerId", customer.id, { shouldValidate: true })}
                            >
                              <span className="font-medium text-ink">{customer.name}</span>
                              <span className="ml-2 text-xs text-ink-400">{customer.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            />
            <FormField
              control={purchaseForm.control}
              name="planId"
              label="Plan"
              required
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans
                      .filter((plan) => plan.isActive)
                      .map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} · {plan.validityDays}d
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={purchaseForm.control}
                name="paidAmount"
                label="Amount paid"
                render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
              />
              <FormField
                control={purchaseForm.control}
                name="paymentMethod"
                label="Payment method"
                render={(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="voucher">Voucher</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <FormField
              control={purchaseForm.control}
              name="startDate"
              label="Start date (optional)"
              render={(field) => <Input type="date" {...field} />}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPurchaseOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={purchaseMutation.isPending}>
                {purchaseMutation.isPending ? "Saving…" : "Sell membership"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Redeem dialog */}
      <Dialog open={Boolean(redeemTarget)} onOpenChange={(open) => !open && setRedeemTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Redeem session</DialogTitle>
            <DialogDescription>
              {redeemTarget ? `${customerName(redeemTarget.customer)} · ${redeemTarget.code}` : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={redeemForm.handleSubmit((values) => redeemMutation.mutate(values))}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={redeemForm.control}
              name="serviceName"
              label="Service"
              required
              description="Sessions matching an included service are used first, otherwise a credit is spent."
              render={(field) => (
                <>
                  <Input list="redeem-services" placeholder="e.g. Haircut" {...field} />
                  <datalist id="redeem-services">
                    {redeemTarget?.includes.map((inc, index) => (
                      <option key={index} value={inc.serviceName ?? ""} />
                    ))}
                  </datalist>
                </>
              )}
            />
            {redeemTarget && redeemTarget.includes.length > 0 && (
              <div className="space-y-1 text-xs text-ink-500">
                {redeemTarget.includes.map((inc, index) => (
                  <p key={index}>
                    {inc.serviceName} · {Math.max(0, inc.limitTotal - inc.limitUsed)} of {inc.limitTotal} left
                  </p>
                ))}
              </div>
            )}
            <FormField
              control={redeemForm.control}
              name="applyDiscount"
              render={(field) => (
                <label className="flex items-center gap-3 text-sm text-ink-700">
                  <Switch checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked)} />
                  Apply plan discount if configured
                </label>
              )}
            />
            <FormField
              control={redeemForm.control}
              name="notes"
              label="Notes"
              render={(field) => <Textarea rows={2} {...field} />}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRedeemTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={redeemMutation.isPending}>
                {redeemMutation.isPending ? "Redeeming…" : "Redeem"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Renew dialog */}
      <Dialog open={Boolean(renewTarget)} onOpenChange={(open) => !open && setRenewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew membership</DialogTitle>
            <DialogDescription>
              {renewTarget ? `${customerName(renewTarget.customer)} · ${renewTarget.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={renewForm.handleSubmit((values) => renewMutation.mutate(values))}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={renewForm.control}
              name="paidAmount"
              label="Amount paid"
              render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
            />
            <FormField
              control={renewForm.control}
              name="paymentMethod"
              label="Payment method"
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="voucher">Voucher</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenewTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={renewMutation.isPending}>
                {renewMutation.isPending ? "Renewing…" : "Renew"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
