import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil, Plus, Scissors } from "lucide-react";
import { apiGetList, apiPatch, apiPost } from "@/services/api";
import type { Service } from "@/types";
import { parseApiError } from "@/lib/utils";
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
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/sonner";

const SERVICE_CATEGORIES = [
  "Haircut",
  "Beard",
  "Hair Care",
  "Facial",
  "Coloring",
  "Styling",
  "Spa",
  "Other",
] as const;

const serviceSchema = z
  .object({
    name: z.string().trim().min(2, "Service name is too short").max(120),
    category: z.enum(SERVICE_CATEGORIES),
    description: z.string().trim().max(4000).optional(),
    price: z.coerce.number().min(0, "Price must be zero or more"),
    discountPrice: z.coerce.number().min(0, "Discount must be zero or more").optional(),
    durationMinutes: z.coerce.number().int().min(5).max(480),
    bufferMinutes: z.coerce.number().int().min(0).max(120).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    isActive: z.boolean(),
  })
  .refine((value) => value.discountPrice == null || value.discountPrice === 0 || value.discountPrice < value.price, {
    message: "Discount price must be less than the regular price",
    path: ["discountPrice"],
  });

type ServiceValues = z.infer<typeof serviceSchema>;

const PAGE_SIZE = 12;

const emptyValues: ServiceValues = {
  name: "",
  category: "Haircut",
  description: "",
  price: 0,
  discountPrice: undefined,
  durationMinutes: 30,
  bufferMinutes: 0,
  sortOrder: 0,
  isActive: true,
};

export default function AdminServicesPage() {
  usePageMeta("Services", "Service menu and pricing.");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = usePermission();

  const form = useForm<ServiceValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: emptyValues,
  });

  const query = useQuery({
    queryKey: ["services", { page, search, category, includeInactive }],
    queryFn: () =>
      apiGetList<Service>("/services", {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        category: category === "all" ? undefined : category,
        includeInactive: includeInactive ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      form.reset({
        name: editing.name,
        category: (editing.category as ServiceValues["category"]) ?? "Other",
        description: editing.description ?? "",
        price: editing.price,
        discountPrice: editing.discountPrice ?? undefined,
        durationMinutes: editing.durationMinutes,
        bufferMinutes: editing.bufferMinutes ?? 0,
        sortOrder: editing.sortOrder ?? 0,
        isActive: editing.isActive,
      });
    } else {
      form.reset(emptyValues);
    }
  }, [editing, dialogOpen, form]);

  const saveMutation = useMutation({
    mutationFn: (values: ServiceValues) => {
      const payload = {
        name: values.name,
        category: values.category,
        description: values.description || "",
        price: values.price,
        discountPrice: values.discountPrice ? values.discountPrice : undefined,
        durationMinutes: values.durationMinutes,
        bufferMinutes: values.bufferMinutes ?? 0,
        sortOrder: values.sortOrder ?? 0,
        isActive: values.isActive,
      };
      return editing
        ? apiPatch<Service>(`/services/${editing.id}`, payload)
        : apiPost<Service>("/services", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Service updated" : "Service created");
      setDialogOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (error) => {
      toast.error("Couldn't save service", { description: parseApiError(error).message });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<Service>(`/services/${id}/status`, { isActive }),
    onSuccess: () => {
      toast.success("Availability updated");
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (error) => {
      toast.error("Couldn't update availability", { description: parseApiError(error).message });
    },
  });

  async function handleStatusToggle(service: Service, next: boolean) {
    if (!next) {
      const upcoming = service.upcomingAppointments ?? 0;
      const ok = await confirm({
        title: `Deactivate ${service.name}?`,
        description:
          upcoming > 0
            ? `This service has ${upcoming} upcoming appointment(s). They won't be cancelled.`
            : "It will be hidden from the booking menu.",
        confirmText: "Deactivate",
        destructive: true,
      });
      if (!ok) return;
    }
    statusMutation.mutate({ id: service.id, isActive: next });
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setDialogOpen(true);
  }

  const services = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = search !== "" || category !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        subtitle="Service menu and pricing."
        actions={
          can("services.manage") && (
            <Button variant="gold" size="sm" onClick={openCreate}>
              <Plus /> Add service
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search services…"
            ariaLabel="Search services"
            className="sm:w-64"
          />
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-44" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {SERVICE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="include-inactive"
            checked={includeInactive}
            onCheckedChange={(value) => {
              setIncludeInactive(value);
              setPage(1);
            }}
          />
          <Label htmlFor="include-inactive" className="text-sm text-ink-500">
            Show inactive
          </Label>
        </div>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={6} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load services"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No services found"
          description={filtered ? "Try a different filter or search term." : "Add your first service to the menu."}
          action={
            can("services.manage") && (
              <Button variant="gold" onClick={openCreate}>
                <Plus /> Add service
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
                  <TableHead>Service</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Upcoming</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <div className="font-medium text-ink">{service.name}</div>
                      {service.description && (
                        <div className="max-w-[22rem] truncate text-xs text-ink-400">
                          {service.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{service.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {service.durationMinutes} min
                      {service.bufferMinutes ? (
                        <span className="text-xs text-ink-400"> +{service.bufferMinutes}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {service.discountPrice ? (
                        <div className="flex flex-col items-end">
                          <Money amount={service.discountPrice} emphasis />
                          <span className="text-xs text-ink-400 line-through">
                            <Money amount={service.price} />
                          </span>
                        </div>
                      ) : (
                        <Money amount={service.price} emphasis />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {service.upcomingAppointments ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-ink-400">
                          {service.isActive ? "Active" : "Inactive"}
                        </span>
                        <Switch
                          checked={service.isActive}
                          disabled={!can("services.manage") || statusMutation.isPending}
                          onCheckedChange={(next) => handleStatusToggle(service, next)}
                          aria-label={`Toggle ${service.name}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {can("services.manage") && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(service)}>
                          <Pencil /> Edit
                        </Button>
                      )}
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
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit service" : "Add service"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update pricing, duration and availability." : "Add a new service to the menu."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          >
            <FormField
              control={form.control}
              name="name"
              label="Name"
              required
              render={(field) => <Input placeholder="Signature haircut" {...field} />}
            />
            <FormField
              control={form.control}
              name="category"
              label="Category"
              required
              render={(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              label="Description"
              render={(field) => (
                <Textarea placeholder="What's included…" {...field} value={field.value ?? ""} />
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="price"
                label="Price"
                required
                render={(field) => <Input type="number" min={0} step="1" {...field} />}
              />
              <FormField
                control={form.control}
                name="discountPrice"
                label="Discount price"
                render={(field) => (
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    {...field}
                    value={field.value ?? ""}
                  />
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="durationMinutes"
                label="Duration (min)"
                required
                render={(field) => <Input type="number" min={5} max={480} step="5" {...field} />}
              />
              <FormField
                control={form.control}
                name="bufferMinutes"
                label="Buffer (min)"
                render={(field) => <Input type="number" min={0} max={120} step="5" {...field} />}
              />
              <FormField
                control={form.control}
                name="sortOrder"
                label="Sort order"
                render={(field) => <Input type="number" min={0} step="1" {...field} />}
              />
            </div>
            <FormField
              control={form.control}
              name="isActive"
              render={(field) => (
                <div className="flex items-center gap-2">
                  <Switch
                    id="service-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="service-active" className="text-sm text-ink-500">
                    Available for booking
                  </Label>
                </div>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
