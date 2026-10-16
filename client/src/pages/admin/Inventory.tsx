import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Boxes, PackagePlus, Plus, Truck, Warehouse } from "lucide-react";
import { apiGet, apiGetList, apiPost } from "@/services/api";
import type { InventoryTransaction, Product, Supplier } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatCard } from "@/components/shared/StatCard";
import { DateTime } from "@/components/shared/DateTime";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

interface StockReport {
  totalInventoryValue: number;
  totalUnits: number;
  lowStockCount: number;
  lowStock: Array<{
    _id?: string;
    id?: string;
    name: string;
    sku: string;
    stockQuantity: number;
    lowStockThreshold: number;
  }>;
  valuation: Array<{
    productId: string;
    name: string;
    sku: string;
    stockQuantity: number;
    costPrice: number;
    value: number;
  }>;
  movementsLast30Days: Array<{ _id: string; count: number; quantity: number }>;
}

const stockTypes = ["in", "out", "adjustment", "waste"] as const;
const txTypes = ["in", "out", "adjustment", "waste", "sale"] as const;

const stockSchema = z
  .object({
    productId: z.string().min(1, "Select a product"),
    type: z.enum(stockTypes),
    quantity: z.coerce.number().min(0).optional(),
    newQuantity: z.coerce.number().min(0).optional(),
    unitCost: z.coerce.number().min(0).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "adjustment") {
      if (value.newQuantity === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newQuantity"], message: "Enter the new quantity" });
      }
    } else if (!value.quantity || value.quantity <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "Enter a quantity greater than zero" });
    }
  });

type StockValues = z.infer<typeof stockSchema>;

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(7, "Enter a valid phone").max(20),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
});

type SupplierValues = z.infer<typeof supplierSchema>;

export default function AdminInventoryPage() {
  usePageMeta("Inventory", "Stock levels, movements and suppliers.");
  const queryClient = useQueryClient();
  const [txPage, setTxPage] = useState(1);
  const [txType, setTxType] = useState<string>("all");
  const [supplierOpen, setSupplierOpen] = useState(false);

  const reportQuery = useQuery({
    queryKey: ["inventory", "stock-report"],
    queryFn: () => apiGet<StockReport>("/inventory/stock-report"),
  });

  const productsQuery = useQuery({
    queryKey: ["products", "for-stock"],
    queryFn: () => apiGetList<Product>("/products", { limit: 100, sort: "name" }),
  });

  const suppliersQuery = useQuery({
    queryKey: ["inventory", "suppliers"],
    queryFn: () => apiGetList<Supplier>("/inventory/suppliers"),
  });

  const transactionsQuery = useQuery({
    queryKey: ["inventory", "transactions", { txPage, txType }],
    queryFn: () =>
      apiGetList<InventoryTransaction>("/inventory/transactions", {
        page: txPage,
        limit: PAGE_SIZE,
        type: txType === "all" ? undefined : txType,
      }),
    placeholderData: keepPreviousData,
  });

  const stockForm = useForm<StockValues>({
    resolver: zodResolver(stockSchema),
    defaultValues: { productId: "", type: "in", quantity: 1, newQuantity: 0, unitCost: 0, notes: "" },
  });

  const supplierForm = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" },
  });

  const stockType = stockForm.watch("type");

  const stockMutation = useMutation({
    mutationFn: (values: StockValues) => {
      const payload: Record<string, unknown> = {
        productId: values.productId,
        type: values.type,
        notes: values.notes || undefined,
      };
      if (values.type === "adjustment") {
        payload.newQuantity = values.newQuantity;
      } else {
        payload.quantity = values.quantity;
        if (values.type === "in" && values.unitCost) payload.unitCost = values.unitCost;
      }
      return apiPost<{ product: Product; transaction: InventoryTransaction }>("/inventory/stock", payload);
    },
    onSuccess: (result) => {
      toast.success(`${result.product.name} now at ${result.product.stockQuantity} units`);
      stockForm.reset({ productId: "", type: "in", quantity: 1, newQuantity: 0, unitCost: 0, notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) =>
      toast.error("Couldn't adjust stock", { description: parseApiError(error).message }),
  });

  const supplierMutation = useMutation({
    mutationFn: (values: SupplierValues) =>
      apiPost<Supplier>("/inventory/suppliers", {
        name: values.name,
        contactPerson: values.contactPerson || undefined,
        phone: values.phone,
        email: values.email || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast.success("Supplier added");
      setSupplierOpen(false);
      supplierForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["inventory", "suppliers"] });
    },
    onError: (error) =>
      toast.error("Couldn't add supplier", { description: parseApiError(error).message }),
  });

  const report = reportQuery.data;
  const products = productsQuery.data?.data ?? [];
  const suppliers = suppliersQuery.data?.data ?? [];
  const transactions = transactionsQuery.data?.data ?? [];
  const txMeta = transactionsQuery.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Track stock movements, valuation and suppliers." />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stock">Stock adjustment</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {reportQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="h-16 animate-pulse rounded bg-ink-100" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : reportQuery.isError ? (
            <ErrorState
              title="Couldn't load stock report"
              message={parseApiError(reportQuery.error).message}
              onRetry={() => reportQuery.refetch()}
            />
          ) : report ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Inventory value"
                  value={<Money amount={report.totalInventoryValue} />}
                  icon={Warehouse}
                />
                <StatCard label="Units in stock" value={report.totalUnits} icon={Boxes} accent="ink" />
                <StatCard
                  label="Low-stock items"
                  value={report.lowStockCount}
                  icon={PackagePlus}
                  accent={report.lowStockCount > 0 ? "danger" : "success"}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Low stock</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {report.lowStock.length === 0 ? (
                    <p className="p-6 text-sm text-ink-500">Every product is above its threshold.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">In stock</TableHead>
                          <TableHead className="text-right">Threshold</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.lowStock.map((product) => (
                          <TableRow key={product.id ?? product._id ?? product.sku}>
                            <TableCell className="font-medium text-ink">{product.name}</TableCell>
                            <TableCell className="font-mono text-xs text-ink-500">{product.sku}</TableCell>
                            <TableCell className="text-right font-semibold text-danger">
                              {product.stockQuantity}
                            </TableCell>
                            <TableCell className="text-right">{product.lowStockThreshold}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Valuation</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {report.valuation.length === 0 ? (
                    <p className="p-6 text-sm text-ink-500">No stock to value yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                          <TableHead className="text-right">Unit cost</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.valuation.map((row) => (
                          <TableRow key={row.productId}>
                            <TableCell className="font-medium text-ink">{row.name}</TableCell>
                            <TableCell className="font-mono text-xs text-ink-500">{row.sku}</TableCell>
                            <TableCell className="text-right">{row.stockQuantity}</TableCell>
                            <TableCell className="text-right">
                              <Money amount={row.costPrice} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Money amount={row.value} emphasis />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="stock">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Adjust stock</CardTitle>
            </CardHeader>
            <CardContent>
              {productsQuery.isLoading ? (
                <p className="text-sm text-ink-500">Loading products…</p>
              ) : (
                <form
                  onSubmit={stockForm.handleSubmit((values) => stockMutation.mutate(values))}
                  className="grid gap-4 sm:grid-cols-2"
                  noValidate
                >
                  <FormField
                    control={stockForm.control}
                    name="productId"
                    label="Product"
                    required
                    className="sm:col-span-2"
                    render={(field) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} · {product.stockQuantity} in stock
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FormField
                    control={stockForm.control}
                    name="type"
                    label="Movement"
                    required
                    render={(field) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">Stock in</SelectItem>
                          <SelectItem value="out">Stock out</SelectItem>
                          <SelectItem value="adjustment">Set exact quantity</SelectItem>
                          <SelectItem value="waste">Waste / damage</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {stockType === "adjustment" ? (
                    <FormField
                      control={stockForm.control}
                      name="newQuantity"
                      label="New quantity"
                      render={(field) => <Input type="number" min={0} step="1" {...field} />}
                    />
                  ) : (
                    <FormField
                      control={stockForm.control}
                      name="quantity"
                      label="Quantity"
                      render={(field) => <Input type="number" min={0} step="1" {...field} />}
                    />
                  )}
                  {stockType === "in" && (
                    <FormField
                      control={stockForm.control}
                      name="unitCost"
                      label="Unit cost (optional)"
                      render={(field) => <Input type="number" min={0} step="0.01" {...field} />}
                    />
                  )}
                  <FormField
                    control={stockForm.control}
                    name="notes"
                    label="Notes"
                    className="sm:col-span-2"
                    render={(field) => <Textarea rows={3} {...field} />}
                  />
                  <div className="sm:col-span-2">
                    <Button type="submit" variant="gold" disabled={stockMutation.isPending}>
                      {stockMutation.isPending ? "Saving…" : "Record movement"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="gold" onClick={() => setSupplierOpen(true)}>
              <Plus /> New supplier
            </Button>
          </div>
          {suppliersQuery.isLoading ? (
            <DataTableSkeleton rows={5} columns={4} />
          ) : suppliersQuery.isError ? (
            <ErrorState
              title="Couldn't load suppliers"
              message={parseApiError(suppliersQuery.error).message}
              onRetry={() => suppliersQuery.refetch()}
            />
          ) : suppliers.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No suppliers yet"
              description="Add suppliers to link them to products."
              action={
                <Button variant="gold" onClick={() => setSupplierOpen(true)}>
                  <Plus /> New supplier
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium text-ink">{supplier.name}</TableCell>
                        <TableCell className="text-ink-500">{supplier.contactPerson ?? "—"}</TableCell>
                        <TableCell>{supplier.phone}</TableCell>
                        <TableCell className="text-ink-500">{supplier.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={supplier.isActive ? "success" : "muted"}>
                            {supplier.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Select value={txType} onValueChange={(value) => { setTxType(value); setTxPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All movements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All movements</SelectItem>
                {txTypes.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {transactionsQuery.isLoading ? (
            <DataTableSkeleton rows={6} columns={5} />
          ) : transactionsQuery.isError ? (
            <ErrorState
              title="Couldn't load transactions"
              message={parseApiError(transactionsQuery.error).message}
              onRetry={() => transactionsQuery.refetch()}
            />
          ) : transactions.length === 0 ? (
            <EmptyState icon={Boxes} title="No stock movements" description="Stock adjustments will appear here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const product = typeof tx.product === "object" ? tx.product : null;
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="font-medium text-ink">
                            {product?.name ?? "—"}
                            {product?.sku ? (
                              <span className="ml-2 font-mono text-xs text-ink-400">{product.sku}</span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tx.quantity >= 0 ? "success" : "danger"}
                              className="capitalize"
                            >
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{tx.balanceAfter}</TableCell>
                          <TableCell>
                            <DateTime value={tx.createdAt} showTime />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {txMeta && txMeta.totalPages > 1 && (
            <Pagination page={txMeta.page} totalPages={txMeta.totalPages} onPageChange={setTxPage} />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
            <DialogDescription>Add a vendor to associate with products.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={supplierForm.handleSubmit((values) => supplierMutation.mutate(values))}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            <FormField
              control={supplierForm.control}
              name="name"
              label="Name"
              required
              className="sm:col-span-2"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={supplierForm.control}
              name="contactPerson"
              label="Contact person"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={supplierForm.control}
              name="phone"
              label="Phone"
              required
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={supplierForm.control}
              name="email"
              label="Email"
              className="sm:col-span-2"
              render={(field) => <Input type="email" {...field} />}
            />
            <FormField
              control={supplierForm.control}
              name="address"
              label="Address"
              className="sm:col-span-2"
              render={(field) => <Input {...field} />}
            />
            <FormField
              control={supplierForm.control}
              name="notes"
              label="Notes"
              className="sm:col-span-2"
              render={(field) => <Textarea rows={2} {...field} />}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setSupplierOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={supplierMutation.isPending}>
                {supplierMutation.isPending ? "Saving…" : "Add supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
