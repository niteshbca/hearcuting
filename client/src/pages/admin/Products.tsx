import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, Pencil, Plus, SearchX } from "lucide-react";
import { apiGetList, apiPatch, apiPost } from "@/services/api";
import type { Product } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { FormField } from "@/components/shared/FormField";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const productSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  sku: z.string().trim().min(2, "SKU is too short").max(60),
  category: z.string().trim().max(80).optional(),
  description: z.string().max(2000).optional(),
  costPrice: z.coerce.number().min(0, "Must be zero or more"),
  salePrice: z.coerce.number().min(0, "Must be zero or more"),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  isRetail: z.boolean(),
});

type ProductValues = z.infer<typeof productSchema>;

const EMPTY: ProductValues = {
  name: "",
  sku: "",
  category: "",
  description: "",
  costPrice: 0,
  salePrice: 0,
  stockQuantity: 0,
  lowStockThreshold: 5,
  isRetail: true,
};

export default function AdminProductsPage() {
  usePageMeta("Products", "Retail and back-bar product catalogue.");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [lowStock, setLowStock] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const query = useQuery({
    queryKey: ["products", { page, search, status, lowStock }],
    queryFn: () =>
      apiGetList<Product>("/products", {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        isActive: status === "all" ? undefined : status,
        lowStock: lowStock ? "true" : undefined,
        sort: "name",
      }),
    placeholderData: keepPreviousData,
  });

  const { control, handleSubmit, reset, formState } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      reset({
        name: editing.name,
        sku: editing.sku,
        category: editing.category ?? "",
        description: editing.description ?? "",
        costPrice: editing.costPrice,
        salePrice: editing.salePrice,
        stockQuantity: editing.stockQuantity,
        lowStockThreshold: editing.lowStockThreshold,
        isRetail: editing.isRetail,
      });
    } else {
      reset(EMPTY);
    }
  }, [dialogOpen, editing, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: ProductValues) => {
      const payload: Record<string, unknown> = {
        name: values.name,
        sku: values.sku,
        category: values.category || undefined,
        description: values.description || undefined,
        costPrice: values.costPrice,
        salePrice: values.salePrice,
        lowStockThreshold: values.lowStockThreshold ?? 5,
        isRetail: values.isRetail,
      };
      if (editing) {
        return apiPatch<Product>(`/products/${editing.id}`, payload);
      }
      payload.stockQuantity = values.stockQuantity ?? 0;
      return apiPost<Product>("/products", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product created");
      setDialogOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) =>
      toast.error("Couldn't save product", { description: parseApiError(error).message }),
  });

  const statusMutation = useMutation({
    mutationFn: (product: Product) =>
      apiPatch<Product>(`/products/${product.id}/status`, { isActive: !product.isActive }),
    onSuccess: () => {
      toast.success("Product updated");
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) =>
      toast.error("Couldn't update product", { description: parseApiError(error).message }),
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setDialogOpen(true);
  }

  function onSubmit(values: ProductValues) {
    saveMutation.mutate(values);
  }

  const products = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtered = search !== "" || status !== "all" || lowStock;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Manage retail inventory and back-bar supplies."
        actions={
          <Button variant="gold" onClick={openCreate}>
            <Plus /> New product
          </Button>
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
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="true">Active</TabsTrigger>
            <TabsTrigger value="false">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <Switch
              checked={lowStock}
              onCheckedChange={(checked) => {
                setLowStock(checked);
                setPage(1);
              }}
            />
            Low stock only
          </label>
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Name, SKU or category…"
            ariaLabel="Search products"
            className="sm:w-72"
          />
        </div>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={6} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load products"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon={filtered ? SearchX : Package}
          title="No products found"
          description={filtered ? "Try a different filter or search term." : "Add your first product to get started."}
          action={
            <Button variant="gold" onClick={openCreate}>
              <Plus /> New product
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const isLow = product.stockQuantity <= product.lowStockThreshold;
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium text-ink">{product.name}</TableCell>
                      <TableCell className="font-mono text-xs text-ink-500">{product.sku}</TableCell>
                      <TableCell className="text-ink-500">{product.category}</TableCell>
                      <TableCell className="text-right">
                        <Money amount={product.costPrice} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={product.salePrice} emphasis />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={isLow ? "font-semibold text-danger" : undefined}>
                          {product.stockQuantity}
                        </span>
                        {isLow && (
                          <Badge variant="danger" className="ml-2">
                            Low
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={product.isActive}
                            aria-label={product.isActive ? "Deactivate" : "Activate"}
                            onCheckedChange={() => statusMutation.mutate(product)}
                            disabled={statusMutation.isPending}
                          />
                          <span className="text-xs text-ink-500">
                            {product.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update product details and pricing." : "Add a product to the catalogue."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={control}
              name="name"
              label="Name"
              required
              className="sm:col-span-2"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={control}
              name="sku"
              label="SKU"
              required
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={control}
              name="category"
              label="Category"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={control}
              name="costPrice"
              label="Cost price"
              required
              render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
            />
            <FormField
              control={control}
              name="salePrice"
              label="Sale price"
              required
              render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
            />
            {!editing && (
              <FormField
                control={control}
                name="stockQuantity"
                label="Opening stock"
                render={(field) => <Input type="number" min={0} step="1" {...field} />}
              />
            )}
            <FormField
              control={control}
              name="lowStockThreshold"
              label="Low-stock threshold"
              render={(field) => <Input type="number" min={0} step="1" {...field} />}
            />
            <FormField
              control={control}
              name="description"
              label="Description"
              className="sm:col-span-2"
              render={(field) => <Textarea rows={3} {...field} />}
            />
            <FormField
              control={control}
              name="isRetail"
              className="sm:col-span-2"
              render={(field) => (
                <label className="flex items-center gap-3 text-sm text-ink-700">
                  <Switch checked={field.value} onCheckedChange={(checked) => field.onChange(checked)} />
                  Available for retail sale at the POS
                </label>
              )}
            />
            {!editing && (
              <p className="text-xs text-ink-400 sm:col-span-2">
                Opening stock is recorded as a purchase movement. Adjust stock afterwards from the
                Inventory page.
              </p>
            )}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={saveMutation.isPending || formState.isSubmitting}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
