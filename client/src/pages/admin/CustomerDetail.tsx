import { useEffect, useState } from "react";
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
import { ArrowLeft, Mail, Pencil, Phone, StickyNote } from "lucide-react";
import { apiGet, apiGetList, apiPatch, apiPost } from "@/services/api";
import type { Appointment, CustomerProfile, Invoice, Membership, StaffProfile } from "@/types";
import { personName } from "@/types";
import { formatDate, initials, parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

interface SummaryCustomerBooking {
  id: string;
  reference: string;
  serviceSnapshot: Appointment["serviceSnapshot"];
  date: string;
  startsAt: string;
  status: Appointment["status"];
  paymentStatus: Appointment["paymentStatus"];
  totalPrice: number;
  staff?: { id: string; name: string } | string | null;
}

interface CustomerSummaryResult {
  profile: CustomerProfile;
  stats: {
    totalVisits: number;
    totalSpent: number;
    noShowCount: number;
    lastVisitAt: string | null;
    favouriteService: string | null;
    preferredStaff: StaffProfile | null;
  };
  recentAppointments: SummaryCustomerBooking[];
  memberships: Membership[];
}

const editSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number"),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  tags: z.string().trim().max(400).optional(),
  notes: z.string().trim().max(5000).optional(),
  marketingOptIn: z.boolean().optional(),
});

type EditValues = z.infer<typeof editSchema>;

const PAGE_SIZE = 10;

export default function AdminCustomerDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = useState("overview");
  const [bookingsPage, setBookingsPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState("");
  const [appendNote, setAppendNote] = useState(true);

  const summaryQuery = useQuery({
    queryKey: ["customer", id, "summary"],
    queryFn: () => apiGet<CustomerSummaryResult>(`/customers/${id}/summary`),
    enabled: Boolean(id),
  });

  usePageMeta(summaryQuery.data?.profile.name ?? "Customer", "Visits, invoices and notes.");

  const bookingsQuery = useQuery({
    queryKey: ["customer", id, "bookings", bookingsPage],
    queryFn: () =>
      apiGetList<SummaryCustomerBooking>(`/customers/${id}/bookings`, {
        page: bookingsPage,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(id) && tab === "bookings",
    placeholderData: keepPreviousData,
  });

  const invoicesQuery = useQuery({
    queryKey: ["customer", id, "invoices", invoicesPage],
    queryFn: () =>
      apiGetList<Invoice>(`/customers/${id}/invoices`, {
        page: invoicesPage,
        limit: PAGE_SIZE,
        sort: "-issuedAt",
      }),
    enabled: Boolean(id) && tab === "invoices",
    placeholderData: keepPreviousData,
  });

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      phone: "",
      gender: undefined,
      birthday: "",
      tags: "",
      notes: "",
      marketingOptIn: true,
    },
  });

  const profile = summaryQuery.data?.profile;

  useEffect(() => {
    if (!profile || !editOpen) return;
    form.reset({
      name: profile.name,
      phone: profile.phone,
      gender: profile.gender,
      birthday: profile.birthday ? profile.birthday.slice(0, 10) : "",
      tags: (profile.tags ?? []).join(", "),
      notes: profile.notes ?? "",
      marketingOptIn: profile.marketingOptIn,
    });
  }, [profile, editOpen, form]);

  const updateMutation = useMutation({
    mutationFn: (values: EditValues) =>
      apiPatch<CustomerProfile>(`/customers/${id}`, {
        name: values.name,
        phone: values.phone,
        gender: values.gender,
        birthday: values.birthday || undefined,
        tags: values.tags
          ? values.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        notes: values.notes,
        marketingOptIn: values.marketingOptIn,
      }),
    onSuccess: () => {
      toast.success("Customer updated");
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["customer", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) => {
      toast.error("Couldn't update customer", { description: parseApiError(error).message });
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => apiPost<CustomerProfile>(`/customers/${id}/notes`, { notes: note, append: appendNote }),
    onSuccess: () => {
      toast.success("Note saved");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["customer", id] });
    },
    onError: (error) => {
      toast.error("Couldn't save note", { description: parseApiError(error).message });
    },
  });

  if (summaryQuery.isLoading) return <LoadingState label="Loading customer…" />;
  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <ErrorState
        title="Couldn't load this customer"
        message={summaryQuery.error ? parseApiError(summaryQuery.error).message : undefined}
        onRetry={() => summaryQuery.refetch()}
      />
    );
  }

  const { stats, recentAppointments, memberships } = summaryQuery.data;
  const currentProfile = summaryQuery.data.profile;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/admin/customers">
            <ArrowLeft /> All customers
          </Link>
        </Button>
        <PageHeader
          title={currentProfile.name}
          subtitle={`Customer since ${formatDate(currentProfile.createdAt)}`}
          actions={
            can("customers.update") && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit profile
              </Button>
            )
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft font-display text-lg text-gold-dark">
          {initials(currentProfile.name)}
        </span>
        <div className="space-y-0.5 text-sm text-ink-500">
          <span className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" /> {currentProfile.email}
          </span>
          <span className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5" /> {currentProfile.phone}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {(currentProfile.tags ?? []).map((t) => (
            <Badge key={t} variant="gold">
              {t}
            </Badge>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total visits" value={stats.totalVisits} accent="gold" />
            <StatCard label="Total spent" value={<Money amount={stats.totalSpent} />} accent="success" />
            <StatCard label="No-shows" value={stats.noShowCount} accent="danger" />
            <StatCard
              label="Last visit"
              value={stats.lastVisitAt ? <DateTime value={stats.lastVisitAt} /> : "Never"}
              accent="ink"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Gender</span>
                  <span className="capitalize text-ink">{currentProfile.gender ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Birthday</span>
                  <span className="text-ink">
                    {currentProfile.birthday ? formatDate(currentProfile.birthday) : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Favourite service</span>
                  <span className="text-ink">{stats.favouriteService ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Preferred staff</span>
                  <span className="text-ink">
                    {stats.preferredStaff?.name ?? personName(currentProfile.preferredStaff) ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-500">Marketing opt-in</span>
                  <span className="text-ink">{currentProfile.marketingOptIn ? "Yes" : "No"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active memberships</CardTitle>
              </CardHeader>
              <CardContent>
                {memberships.length === 0 ? (
                  <p className="py-4 text-sm text-ink-500">No active memberships.</p>
                ) : (
                  <div className="space-y-3">
                    {memberships.map((membership) => (
                      <div key={membership.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-ink">{membership.name}</span>
                          <Badge variant="success">{membership.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-ink-400">
                          Valid {formatDate(membership.validFrom)} → {formatDate(membership.validUntil)}
                          {typeof membership.credits === "number" ? ` · ${membership.credits} credits` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent appointments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentAppointments.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-ink-500">No appointments yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAppointments.map((appt) => (
                      <TableRow key={appt.id}>
                        <TableCell className="font-mono text-xs">{appt.reference}</TableCell>
                        <TableCell>{appt.serviceSnapshot?.name ?? "—"}</TableCell>
                        <TableCell>
                          <DateTime value={appt.startsAt} showTime />
                        </TableCell>
                        <TableCell>{personName(appt.staff) || "Any"}</TableCell>
                        <TableCell>
                          <StatusBadge kind="booking" status={appt.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money amount={appt.totalPrice} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {can("customers.notes") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-gold-dark" /> Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentProfile.notes ? (
                  <pre className="whitespace-pre-wrap rounded-md bg-cream/60 p-3 text-sm text-ink-600">
                    {currentProfile.notes}
                  </pre>
                ) : (
                  <p className="text-sm text-ink-400">No notes yet.</p>
                )}
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note…"
                  aria-label="Add a note"
                />
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="append-note"
                      checked={appendNote}
                      onCheckedChange={setAppendNote}
                      aria-label="Append instead of replacing"
                    />
                    <Label htmlFor="append-note" className="text-sm text-ink-500">
                      Append to existing notes
                    </Label>
                  </div>
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={!note.trim() || noteMutation.isPending}
                    onClick={() => noteMutation.mutate()}
                  >
                    {noteMutation.isPending ? "Saving…" : "Save note"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bookings">
          {bookingsQuery.isLoading ? (
            <DataTableSkeleton rows={5} columns={6} />
          ) : bookingsQuery.isError ? (
            <ErrorState
              title="Couldn't load bookings"
              message={parseApiError(bookingsQuery.error).message}
              onRetry={() => bookingsQuery.refetch()}
            />
          ) : (bookingsQuery.data?.data ?? []).length === 0 ? (
            <EmptyState title="No bookings" description="This customer hasn't booked yet." />
          ) : (
            <div className="space-y-4">
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
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bookingsQuery.data?.data ?? []).map((appt) => (
                        <TableRow key={appt.id}>
                          <TableCell className="font-mono text-xs">{appt.reference}</TableCell>
                          <TableCell>{appt.serviceSnapshot?.name ?? "—"}</TableCell>
                          <TableCell>
                            <DateTime value={appt.startsAt} showTime />
                          </TableCell>
                          <TableCell>{personName(appt.staff) || "Any"}</TableCell>
                          <TableCell>
                            <StatusBadge kind="booking" status={appt.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Money amount={appt.totalPrice} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              {bookingsQuery.data?.meta && bookingsQuery.data.meta.totalPages > 1 && (
                <Pagination
                  page={bookingsQuery.data.meta.page}
                  totalPages={bookingsQuery.data.meta.totalPages}
                  onPageChange={setBookingsPage}
                />
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {invoicesQuery.isLoading ? (
            <DataTableSkeleton rows={5} columns={6} />
          ) : invoicesQuery.isError ? (
            <ErrorState
              title="Couldn't load invoices"
              message={parseApiError(invoicesQuery.error).message}
              onRetry={() => invoicesQuery.refetch()}
            />
          ) : (invoicesQuery.data?.data ?? []).length === 0 ? (
            <EmptyState title="No invoices" description="No invoices on record for this customer." />
          ) : (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invoicesQuery.data?.data ?? []).map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                          <TableCell>
                            <DateTime value={invoice.issuedAt} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge kind="invoice" status={invoice.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Money amount={invoice.total} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Money amount={invoice.balanceDue} emphasis />
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
              {invoicesQuery.data?.meta && invoicesQuery.data.meta.totalPages > 1 && (
                <Pagination
                  page={invoicesQuery.data.meta.page}
                  totalPages={invoicesQuery.data.meta.totalPages}
                  onPageChange={setInvoicesPage}
                />
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="gender"
                label="Gender"
                render={(field) => (
                  <SelectLike
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(value || undefined)}
                  />
                )}
              />
              <FormField
                control={form.control}
                name="birthday"
                label="Birthday"
                render={(field) => (
                  <Input
                    type="date"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="tags"
              label="Tags"
              description="Comma-separated, e.g. VIP, colour, referral"
              render={(field) => <Input {...field} value={field.value ?? ""} />}
            />
            <FormField
              control={form.control}
              name="notes"
              label="Notes"
              render={(field) => <Textarea {...field} value={field.value ?? ""} />}
            />
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="marketingOptIn"
                render={(field) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="marketing-opt-in"
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="marketing-opt-in" className="text-sm text-ink-500">
                      Marketing opt-in
                    </Label>
                  </div>
                )}
              />
            </div>
            <div className="flex justify-end gap-2">
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
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectLike({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        { value: "female", label: "Female" },
        { value: "male", label: "Male" },
        { value: "other", label: "Other" },
      ].map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "gold" : "outline"}
          size="sm"
          onClick={() => onChange(value === option.value ? "" : option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
