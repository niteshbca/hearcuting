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
import { UserPlus, UsersRound } from "lucide-react";
import { apiGetList, apiPost } from "@/services/api";
import type { CustomerProfile } from "@/types";
import { initials, parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Money } from "@/components/shared/Money";
import { DateTime } from "@/components/shared/DateTime";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/sonner";

const createCustomerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
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
  notes: z.string().trim().max(5000).optional(),
});

type CreateCustomerValues = z.infer<typeof createCustomerSchema>;

const PAGE_SIZE = 12;

export default function AdminCustomersPage() {
  usePageMeta("Customers", "Your client book, visits and spend.");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { can } = usePermission();

  const form = useForm<CreateCustomerValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { name: "", email: "", phone: "", gender: undefined, birthday: "", notes: "" },
  });

  const query = useQuery({
    queryKey: ["customers", { page, search, tag }],
    queryFn: () =>
      apiGetList<CustomerProfile>("/customers", {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        tag: tag || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateCustomerValues) =>
      apiPost<CustomerProfile & { existing?: boolean }>("/customers", {
        name: values.name,
        email: values.email,
        phone: values.phone,
        gender: values.gender,
        birthday: values.birthday || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: (created) => {
      if (created.existing) {
        toast.info("Existing customer", {
          description: "A customer with this email already exists — showing the existing profile.",
        });
      } else {
        toast.success("Customer added");
      }
      setCreateOpen(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) => {
      toast.error("Couldn't add customer", { description: parseApiError(error).message });
    },
  });

  const customers = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = search !== "" || tag !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Your client book, visits and spend."
        actions={
          can("customers.create") && (
            <Button variant="gold" size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus /> Add customer
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search name, email or phone…"
          ariaLabel="Search customers"
          className="sm:w-80"
        />
        <Input
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by tag…"
          aria-label="Filter by tag"
          className="sm:w-48"
        />
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={6} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load customers"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No customers found"
          description={filtered ? "Try a different search or tag." : "Add your first customer to get started."}
          action={
            can("customers.create") && (
              <Button variant="gold" onClick={() => setCreateOpen(true)}>
                <UserPlus /> Add customer
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
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Last visit</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Total spent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-dark">
                          {initials(customer.name)}
                        </span>
                        <div>
                          <div className="font-medium text-ink">{customer.name}</div>
                          <div className="text-xs text-ink-400">
                            Joined <DateTime value={customer.createdAt} />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{customer.email}</div>
                      <div className="text-xs text-ink-400">{customer.phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {customer.tags?.length ? (
                          customer.tags.map((t) => (
                            <Badge key={t} variant="gold">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.lastVisitAt || customer.lastVisit ? (
                        <DateTime value={customer.lastVisitAt ?? customer.lastVisit} />
                      ) : (
                        <span className="text-xs text-ink-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{customer.totalVisits}</TableCell>
                    <TableCell className="text-right">
                      <Money amount={customer.totalSpent} emphasis />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/admin/customers/${customer.id}`}>View profile</Link>
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
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>Create a new profile in the client book.</DialogDescription>
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
                render={(field) => <Input placeholder="Jane Doe" {...field} />}
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
              render={(field) => <Input type="email" placeholder="jane@example.com" {...field} />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="gender"
                label="Gender"
                render={(field) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(value) => field.onChange(value || undefined)}
                  >
                    <SelectTrigger aria-label="Gender">
                      <SelectValue placeholder="Prefer not to say" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
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
              name="notes"
              label="Notes"
              render={(field) => (
                <Textarea placeholder="Preferences, allergies, stylist notes…" {...field} />
              )}
            />
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
                {createMutation.isPending ? "Adding…" : "Add customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
