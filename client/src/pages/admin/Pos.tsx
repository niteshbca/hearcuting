import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
} from "lucide-react";
import { apiGet, apiGetList, apiPost } from "@/services/api";
import type {
  CustomerProfile,
  Invoice,
  Membership,
  Payment,
  PaymentMethod,
  Product,
  Service,
  StaffProfile,
} from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

interface CartItem {
  key: string;
  type: "service" | "product";
  refId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  staffId?: string;
}

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "upi", "card", "online", "voucher"];

function servicePrice(service: Service): number {
  return service.discountPrice ?? service.price;
}

export default function AdminPosPage() {
  usePageMeta("Point of Sale", "Ring up services and retail products.");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [redeemMembershipId, setRedeemMembershipId] = useState("");
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState<Invoice | null>(null);

  const canViewStaff = Boolean(user && ["owner", "manager", "receptionist"].includes(user.role));

  const servicesQuery = useQuery({
    queryKey: ["pos", "services"],
    queryFn: () => apiGetList<Service>("/services", { limit: 100, sort: "name" }),
  });

  const productsQuery = useQuery({
    queryKey: ["pos", "products"],
    queryFn: () => apiGetList<Product>("/products", { limit: 100, isActive: "true", sort: "name" }),
  });

  const customersQuery = useQuery({
    queryKey: ["pos", "customers", customerSearch],
    queryFn: () =>
      apiGetList<CustomerProfile>("/customers", {
        limit: 15,
        search: customerSearch,
        sort: "name",
      }),
    enabled: customerSearch.trim().length >= 2,
  });

  const staffQuery = useQuery({
    queryKey: ["pos", "staff"],
    queryFn: () => apiGetList<StaffProfile>("/staff", { limit: 100, isActive: "true", sort: "name" }),
    enabled: canViewStaff,
  });

  const membershipsQuery = useQuery({
    queryKey: ["pos", "memberships", customer?.id],
    queryFn: () => apiGet<Membership[]>(`/memberships/customer/${customer?.id ?? ""}`),
    enabled: Boolean(customer?.id),
  });

  const staff = staffQuery.data?.data ?? [];
  const memberships = (membershipsQuery.data ?? []).filter((m) => m.status === "active");

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart],
  );
  const discountAmount = useMemo(() => {
    if (discountValue <= 0) return 0;
    return discountType === "percent"
      ? (subtotal * discountValue) / 100
      : Math.min(discountValue, subtotal);
  }, [subtotal, discountType, discountValue]);
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = useMemo(() => (taxable * taxRate) / 100, [taxable, taxRate]);
  const total = taxable + taxAmount;

  function addService(service: Service) {
    setCompleted(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.type === "service" && i.refId === service.id);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          key: `service-${service.id}`,
          type: "service",
          refId: service.id,
          name: service.name,
          unitPrice: servicePrice(service),
          quantity: 1,
        },
      ];
    });
  }

  function addProduct(product: Product) {
    setCompleted(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.type === "product" && i.refId === product.id);
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: Math.min(i.quantity + 1, product.stockQuantity) } : i,
        );
      }
      return [
        ...prev,
        {
          key: `product-${product.id}`,
          type: "product",
          refId: product.id,
          name: product.name,
          unitPrice: product.salePrice,
          quantity: 1,
        },
      ];
    });
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function setItemStaff(key: string, staffId: string) {
    setCart((prev) =>
      prev.map((item) => (item.key === key ? { ...item, staffId: staffId || undefined } : item)),
    );
  }

  function removeItem(key: string) {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }

  function resetSale() {
    setCart([]);
    setCustomer(null);
    setCustomerSearch("");
    setWalkInName("");
    setWalkInPhone("");
    setWalkInEmail("");
    setDiscountType("percent");
    setDiscountValue(0);
    setTaxRate(0);
    setPaymentAmount(0);
    setRedeemMembershipId("");
    setNotes("");
  }

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<{ invoice: Invoice; payments: Payment[] }>("/invoices", payload),
    onSuccess: (result) => {
      toast.success(`Sale completed · ${result.invoice.invoiceNumber}`);
      setCompleted(result.invoice);
      resetSale();
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) =>
      toast.error("Couldn't complete sale", { description: parseApiError(error).message }),
  });

  function handleCheckout() {
    if (cart.length === 0) {
      toast.error("Add at least one item to the sale");
      return;
    }
    if (!customer && walkInName.trim().length < 2) {
      toast.error("Enter the customer's name or select a saved customer");
      return;
    }
    if (!customer && walkInPhone.trim().length < 7) {
      toast.error("Enter a valid phone number for the walk-in customer");
      return;
    }

    const payload: Record<string, unknown> = {
      items: cart.map((item) => ({
        type: item.type,
        refId: item.refId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.staffId ? { staff: item.staffId } : {}),
      })),
    };
    if (customer) {
      payload.customerId = customer.id;
    } else {
      payload.customer = {
        name: walkInName.trim(),
        phone: walkInPhone.trim(),
        ...(walkInEmail.trim() ? { email: walkInEmail.trim() } : {}),
      };
    }
    if (discountValue > 0) payload.discount = { type: discountType, value: discountValue };
    if (taxRate > 0) payload.taxRate = taxRate;
    if (paymentAmount > 0) payload.payments = [{ method: paymentMethod, amount: paymentAmount }];
    if (redeemMembershipId) payload.redeemMembershipId = redeemMembershipId;
    if (notes.trim()) payload.notes = notes.trim();

    createMutation.mutate(payload);
  }

  const services = servicesQuery.data?.data ?? [];
  const products = productsQuery.data?.data ?? [];
  const customerResults = customersQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Point of Sale"
        subtitle="Ring up services, products and memberships from the front desk."
        actions={
          <Button variant="outline" size="sm" onClick={resetSale} disabled={cart.length === 0}>
            Clear sale
          </Button>
        }
      />

      {completed && (
        <Card className="border-success/30 bg-success-soft/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium text-ink">Sale completed</p>
                <p className="text-sm text-ink-500">
                  Invoice {completed.invoiceNumber} · <Money amount={completed.total} />
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/invoices/${completed.id}`}>View invoice</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent>
              {servicesQuery.isLoading ? (
                <p className="text-sm text-ink-500">Loading services…</p>
              ) : services.length === 0 ? (
                <p className="text-sm text-ink-500">No services available.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => addService(service)}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2.5 text-left transition-colors hover:border-gold hover:bg-gold-soft/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{service.name}</span>
                        <span className="block text-xs text-ink-400">{service.durationMinutes} min</span>
                      </span>
                      <Money amount={servicePrice(service)} className="shrink-0 text-sm" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
            </CardHeader>
            <CardContent>
              {productsQuery.isLoading ? (
                <p className="text-sm text-ink-500">Loading products…</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-ink-500">No products available.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      disabled={product.stockQuantity <= 0}
                      onClick={() => addProduct(product)}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2.5 text-left transition-colors hover:border-gold hover:bg-gold-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{product.name}</span>
                        <span className="block text-xs text-ink-400">Stock {product.stockQuantity}</span>
                      </span>
                      <Money amount={product.salePrice} className="shrink-0 text-sm" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-gold-dark" /> Cart
              </CardTitle>
              <Badge variant="muted">{cart.reduce((n, i) => n + i.quantity, 0)} items</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">Tap a service or product to begin.</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.key} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                          <p className="text-xs capitalize text-ink-400">{item.type}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeItem(item.key)}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Decrease quantity"
                            onClick={() => changeQuantity(item.key, -1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Increase quantity"
                            onClick={() => changeQuantity(item.key, 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Money amount={item.unitPrice * item.quantity} emphasis />
                      </div>
                      {canViewStaff && staff.length > 0 && (
                        <div className="mt-2">
                          <Select
                            value={item.staffId ?? "none"}
                            onValueChange={(value) => setItemStaff(item.key, value === "none" ? "" : value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign staff" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No staff</SelectItem>
                              {staff.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <div className="flex items-center justify-between rounded-md border border-gold/40 bg-gold-soft/40 p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{customer.name}</p>
                    <p className="text-xs text-ink-400">{customer.phone}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <SearchInput
                    value={customerSearch}
                    onChange={setCustomerSearch}
                    placeholder="Search saved customers…"
                    ariaLabel="Search customers"
                  />
                  {customerSearch.trim().length >= 2 && (
                    <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-border p-1">
                      {customersQuery.isLoading ? (
                        <p className="px-2 py-1.5 text-xs text-ink-400">Searching…</p>
                      ) : customerResults.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-ink-400">No matching customers.</p>
                      ) : (
                        customerResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => {
                              setCustomer(result);
                              setCustomerSearch("");
                              setRedeemMembershipId("");
                            }}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-cream"
                          >
                            <Search className="h-3.5 w-3.5 text-ink-400" />
                            <span className="min-w-0 flex-1 truncate">{result.name}</span>
                            <span className="text-xs text-ink-400">{result.phone}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-ink-400">
                    <UserPlus className="h-3.5 w-3.5" /> Or add a walk-in
                  </div>
                  <Input
                    placeholder="Name"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                  />
                  <Input
                    placeholder="Email (optional)"
                    type="email"
                    value={walkInEmail}
                    onChange={(e) => setWalkInEmail(e.target.value)}
                  />
                </>
              )}

              {customer && memberships.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pos-membership">Redeem membership (optional)</Label>
                  <Select
                    value={redeemMembershipId || "none"}
                    onValueChange={(value) => setRedeemMembershipId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="pos-membership">
                      <SelectValue placeholder="No membership" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No membership</SelectItem>
                      {memberships.map((membership) => (
                        <SelectItem key={membership.id} value={membership.id}>
                          {membership.name} · {membership.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals &amp; payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pos-discount-type">Discount</Label>
                  <Select
                    value={discountType}
                    onValueChange={(value) => setDiscountType(value as "percent" | "fixed")}
                  >
                    <SelectTrigger id="pos-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pos-discount-value">Value</Label>
                  <Input
                    id="pos-discount-value"
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="pos-tax">Tax rate (%)</Label>
                <Input
                  id="pos-tax"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-1.5 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-500">Subtotal</span>
                  <Money amount={subtotal} />
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount</span>
                    <span>
                      −<Money amount={discountAmount} />
                    </span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-500">Tax</span>
                    <Money amount={taxAmount} />
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-base">
                  <span className="font-medium text-ink">Total</span>
                  <Money amount={total} emphasis />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pos-method">Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                  >
                    <SelectTrigger id="pos-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method} className="capitalize">
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pos-amount">Amount received</Label>
                  <Input
                    id="pos-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPaymentAmount(Number(total.toFixed(2)))}
              >
                Mark full amount received
              </Button>

              <div className="grid gap-1.5">
                <Label htmlFor="pos-notes">Notes</Label>
                <Textarea
                  id="pos-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note for this sale…"
                />
              </div>

              <Button
                type="button"
                variant="gold"
                size="lg"
                className="w-full"
                disabled={createMutation.isPending || cart.length === 0}
                onClick={handleCheckout}
              >
                {createMutation.isPending ? "Processing…" : `Charge ${total.toFixed(2)}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
