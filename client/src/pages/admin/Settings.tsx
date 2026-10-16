import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control, type FieldPath } from "react-hook-form";
import { z } from "zod";
import {
  Building2,
  Check,
  Clock,
  CreditCard,
  Image as ImageIcon,
  Plug,
  Plus,
  Save,
  ScrollText,
  Trash2,
  X,
} from "lucide-react";
import api, { apiGet, apiPatch, apiPut } from "@/services/api";
import type {
  BusinessHours,
  IntegrationFlags,
  SalonSettingsFull,
} from "@/types";
import { parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";

/* --------------------------------- Schema ----------------------------------- */

const settingsSchema = z.object({
  salonName: z.string().trim().min(1, "Salon name is required").max(120),
  tagline: z.string().max(200),
  phone: z.string().max(30),
  whatsapp: z.string().max(30),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")),
  currencyCode: z.string().trim().min(1, "Required").max(8),
  currencySymbol: z.string().trim().min(1, "Required").max(4),
  timezone: z.string().trim().min(1, "Required").max(64),
  aboutText: z.string().max(8000),
  address: z.object({
    line1: z.string().max(200),
    line2: z.string().max(200),
    city: z.string().max(100),
    state: z.string().max(100),
    postalCode: z.string().max(20),
    country: z.string().max(100),
  }),
  social: z.object({
    instagram: z.string().max(300),
    facebook: z.string().max(300),
    youtube: z.string().max(300),
  }),
  booking: z.object({
    autoConfirm: z.boolean(),
    allowGuest: z.boolean(),
    maxAdvanceDays: z.number().int().min(1).max(365),
    minNoticeHours: z.number().min(0).max(168),
    slotIntervalMinutes: z.number().int().min(5).max(120),
    bufferMinutes: z.number().int().min(0).max(120),
    requireDeposit: z.boolean(),
    depositPercent: z.number().min(1).max(100),
    rescheduleCutoffHours: z.number().min(0).max(168),
    cancelCutoffHours: z.number().min(0).max(168),
    noShowFeePercent: z.number().min(0).max(100),
    cancellationPolicyText: z.string().max(4000),
  }),
  notifications: z.object({
    emailEnabled: z.boolean(),
    remindersEnabled: z.boolean(),
    remindersHoursBefore: z.number().min(1).max(168),
  }),
  payments: z.object({
    onlinePaymentsEnabled: z.boolean(),
    showPrices: z.boolean(),
  }),
  privacyPolicyText: z.string().max(20000),
  termsText: z.string().max(20000),
  logoUrl: z.string().max(500),
  heroImages: z.array(z.string().max(500)).max(12),
  galleryImages: z
    .array(z.object({ url: z.string().max(500), caption: z.string().max(200).optional() }))
    .max(200),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

function toFormValues(settings: SalonSettingsFull): SettingsFormValues {
  return {
    salonName: settings.salonName,
    tagline: settings.tagline,
    phone: settings.phone,
    whatsapp: settings.whatsapp,
    email: settings.email,
    currencyCode: settings.currency.code,
    currencySymbol: settings.currency.symbol,
    timezone: settings.timezone,
    aboutText: settings.aboutText,
    address: {
      line1: settings.address.line1 ?? "",
      line2: settings.address.line2 ?? "",
      city: settings.address.city ?? "",
      state: settings.address.state ?? "",
      postalCode: settings.address.postalCode ?? "",
      country: settings.address.country ?? "",
    },
    social: {
      instagram: settings.social.instagram ?? "",
      facebook: settings.social.facebook ?? "",
      youtube: settings.social.youtube ?? "",
    },
    booking: { ...settings.booking },
    notifications: { ...settings.notifications },
    payments: { ...settings.payments },
    privacyPolicyText: settings.privacyPolicyText,
    termsText: settings.termsText,
    logoUrl: settings.logoUrl ?? "",
    heroImages: settings.heroImages ?? [],
    galleryImages: (settings.galleryImages ?? []).map((image) => ({
      url: image.url,
      caption: image.caption ?? "",
    })),
  };
}

function toPayload(values: SettingsFormValues): Record<string, unknown> {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    salonName: values.salonName,
    tagline: values.tagline,
    phone: values.phone,
    whatsapp: values.whatsapp,
    email: values.email,
    currency: { code: values.currencyCode, symbol: values.currencySymbol },
    timezone: values.timezone,
    aboutText: values.aboutText,
    address: {
      line1: values.address.line1,
      line2: optional(values.address.line2),
      city: values.address.city,
      state: optional(values.address.state),
      postalCode: optional(values.address.postalCode),
      country: values.address.country,
    },
    social: {
      instagram: optional(values.social.instagram),
      facebook: optional(values.social.facebook),
      youtube: optional(values.social.youtube),
    },
    booking: values.booking,
    notifications: values.notifications,
    payments: values.payments,
    privacyPolicyText: values.privacyPolicyText,
    termsText: values.termsText,
    logoUrl: values.logoUrl,
    heroImages: values.heroImages.filter(Boolean),
    galleryImages: values.galleryImages
      .filter((image) => image.url.trim())
      .map((image) => ({ url: image.url, caption: optional(image.caption ?? "") })),
  };
}

/* ------------------------------- Field helpers ------------------------------ */

function TextField({
  control,
  name,
  label,
  description,
  placeholder,
  required,
  type = "text",
  className,
}: {
  control: Control<SettingsFormValues>;
  name: FieldPath<SettingsFormValues>;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={(field) => (
        <Input type={type} placeholder={placeholder} value={(field.value ?? "") as string} onChange={field.onChange} onBlur={field.onBlur} name={field.name} ref={field.ref} />
      )}
    />
  );
}

function NumberField({
  control,
  name,
  label,
  description,
  min,
  max,
  step,
}: {
  control: Control<SettingsFormValues>;
  name: FieldPath<SettingsFormValues>;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      render={(field) => (
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={typeof field.value === "number" ? field.value : ""}
          onChange={(event) => field.onChange(event.target.value === "" ? undefined : Number(event.target.value))}
          onBlur={field.onBlur}
          name={field.name}
          ref={field.ref}
        />
      )}
    />
  );
}

function ToggleField({
  control,
  name,
  label,
  description,
}: {
  control: Control<SettingsFormValues>;
  name: FieldPath<SettingsFormValues>;
  label: string;
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      render={(field) => (
        <div className="flex items-center gap-3 pt-1">
          <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
          <span className="text-sm text-ink-500">{field.value ? "Enabled" : "Disabled"}</span>
        </div>
      )}
    />
  );
}

/* ------------------------------ Settings form ------------------------------- */

function SettingsForm({
  settings,
  integrations,
  canManage,
}: {
  settings: SalonSettingsFull;
  integrations: IntegrationFlags;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const formValues = useMemo(() => toFormValues(settings), [settings]);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: formValues,
    mode: "onBlur",
  });

  const saveMutation = useMutation({
    mutationFn: (values: SettingsFormValues) => apiPatch<SalonSettingsFull>("/settings", toPayload(values)),
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["public-settings"] });
    },
    onError: (error) => toast.error("Couldn't save settings", { description: parseApiError(error).message }),
  });

  const heroImages = form.watch("heroImages");
  const galleryImages = form.watch("galleryImages");

  function setHero(index: number, url: string | null) {
    const next = [...heroImages];
    next[index] = url ?? "";
    form.setValue("heroImages", next, { shouldDirty: true });
  }
  function addHero() {
    form.setValue("heroImages", [...heroImages, ""], { shouldDirty: true });
  }
  function removeHero(index: number) {
    form.setValue(
      "heroImages",
      heroImages.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
  }
  function setGallery(index: number, patch: Partial<{ url: string; caption: string }>) {
    const next = galleryImages.map((image, i) => (i === index ? { ...image, ...patch } : image));
    form.setValue("galleryImages", next, { shouldDirty: true });
  }
  function addGallery() {
    form.setValue("galleryImages", [...galleryImages, { url: "", caption: "" }], { shouldDirty: true });
  }
  function removeGallery(index: number) {
    form.setValue(
      "galleryImages",
      galleryImages.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))} noValidate>
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">
            <Building2 className="mr-1 h-4 w-4" /> General
          </TabsTrigger>
          <TabsTrigger value="branding">
            <ImageIcon className="mr-1 h-4 w-4" /> Branding
          </TabsTrigger>
          <TabsTrigger value="booking">
            <Clock className="mr-1 h-4 w-4" /> Booking
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-1 h-4 w-4" /> Payments
          </TabsTrigger>
          <TabsTrigger value="policies">
            <ScrollText className="mr-1 h-4 w-4" /> Policies
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="mr-1 h-4 w-4" /> Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Salon profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="salonName" label="Salon name" required />
              <TextField control={form.control} name="tagline" label="Tagline" />
              <TextField control={form.control} name="timezone" label="Timezone" description="e.g. Asia/Kolkata" required />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="currencyCode" label="Currency code" required />
                <TextField control={form.control} name="currencySymbol" label="Symbol" required />
              </div>
              <FormField
                control={form.control}
                name="aboutText"
                label="About the salon"
                className="sm:col-span-2"
                render={(field) => (
                  <Textarea rows={4} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact & location</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="phone" label="Phone" />
              <TextField control={form.control} name="whatsapp" label="WhatsApp" />
              <TextField control={form.control} name="email" label="Email" type="email" className="sm:col-span-2" />
              <TextField control={form.control} name="address.line1" label="Address line 1" />
              <TextField control={form.control} name="address.line2" label="Address line 2" />
              <TextField control={form.control} name="address.city" label="City" />
              <TextField control={form.control} name="address.state" label="State" />
              <TextField control={form.control} name="address.postalCode" label="Postal code" />
              <TextField control={form.control} name="address.country" label="Country" />
              <TextField control={form.control} name="social.instagram" label="Instagram" />
              <TextField control={form.control} name="social.facebook" label="Facebook" />
              <TextField control={form.control} name="social.youtube" label="YouTube" className="sm:col-span-2" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="logoUrl"
                label="Logo image"
                render={(field) => <ImageUpload value={field.value} onChange={(url) => field.onChange(url ?? "")} disabled={!canManage} />}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Hero images</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addHero} disabled={!canManage || heroImages.length >= 12}>
                <Plus /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {heroImages.length === 0 ? (
                <p className="text-sm text-ink-500">No hero images yet.</p>
              ) : (
                heroImages.map((image, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-1">
                      <ImageUpload value={image} onChange={(url) => setHero(index, url)} disabled={!canManage} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeHero(index)} disabled={!canManage} aria-label="Remove hero image">
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Gallery</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addGallery} disabled={!canManage}>
                <Plus /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {galleryImages.length === 0 ? (
                <p className="text-sm text-ink-500">No gallery images yet.</p>
              ) : (
                galleryImages.map((image, index) => (
                  <div key={index} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <ImageUpload value={image.url} onChange={(url) => setGallery(index, { url: url ?? "" })} disabled={!canManage} label="Image" />
                    <div className="grid gap-1.5">
                      <Label>Caption</Label>
                      <Input value={image.caption ?? ""} onChange={(event) => setGallery(index, { caption: event.target.value })} disabled={!canManage} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeGallery(index)} disabled={!canManage} aria-label="Remove gallery image">
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="booking" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Booking rules</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <ToggleField control={form.control} name="booking.autoConfirm" label="Auto-confirm bookings" />
              <ToggleField control={form.control} name="booking.allowGuest" label="Allow guest bookings" />
              <ToggleField control={form.control} name="booking.requireDeposit" label="Require deposit" />
              <NumberField control={form.control} name="booking.maxAdvanceDays" label="Max advance days" min={1} max={365} />
              <NumberField control={form.control} name="booking.minNoticeHours" label="Minimum notice (hours)" min={0} max={168} />
              <NumberField control={form.control} name="booking.slotIntervalMinutes" label="Slot interval (minutes)" min={5} max={120} />
              <NumberField control={form.control} name="booking.bufferMinutes" label="Buffer (minutes)" min={0} max={120} />
              <NumberField control={form.control} name="booking.depositPercent" label="Deposit percent" min={1} max={100} />
              <NumberField control={form.control} name="booking.rescheduleCutoffHours" label="Reschedule cutoff (hours)" min={0} max={168} />
              <NumberField control={form.control} name="booking.cancelCutoffHours" label="Cancel cutoff (hours)" min={0} max={168} />
              <NumberField control={form.control} name="booking.noShowFeePercent" label="No-show fee percent" min={0} max={100} />
              <FormField
                control={form.control}
                name="booking.cancellationPolicyText"
                label="Cancellation policy"
                className="sm:col-span-2"
                render={(field) => (
                  <Textarea rows={3} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <ToggleField control={form.control} name="payments.onlinePaymentsEnabled" label="Online payments" />
              <ToggleField control={form.control} name="payments.showPrices" label="Show prices publicly" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <ToggleField control={form.control} name="notifications.emailEnabled" label="Email notifications" />
              <ToggleField control={form.control} name="notifications.remindersEnabled" label="Appointment reminders" />
              <NumberField
                control={form.control}
                name="notifications.remindersHoursBefore"
                label="Reminder lead time (hours)"
                min={1}
                max={168}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Privacy policy</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="privacyPolicyText"
                render={(field) => (
                  <Textarea rows={10} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                )}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Terms & conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="termsText"
                render={(field) => (
                  <Textarea rows={10} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Service integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <IntegrationRow label="SMTP email" configured={integrations.smtpConfigured} detail="Outbound transactional email" />
              <IntegrationRow label="Razorpay" configured={integrations.razorpayConfigured} detail="Online card & UPI payments" />
              <IntegrationRow label="Cloudinary" configured={integrations.cloudinaryConfigured} detail={`Image uploads (${integrations.uploadProvider})`} />
              <p className="text-xs text-ink-400">
                These are configured through server environment variables and cannot be edited here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {canManage && (
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => form.reset(formValues)} disabled={saveMutation.isPending}>
            Discard changes
          </Button>
          <Button type="submit" variant="gold" disabled={saveMutation.isPending}>
            <Save /> {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}

function IntegrationRow({ label, configured, detail }: { label: string; configured: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-400">{detail}</p>
      </div>
      {configured ? (
        <Badge variant="success">
          <Check className="h-3 w-3" /> Configured
        </Badge>
      ) : (
        <Badge variant="muted">
          <X className="h-3 w-3" /> Not configured
        </Badge>
      )}
    </div>
  );
}

/* ----------------------------- Business hours ------------------------------- */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function BusinessHoursCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", "business-hours"],
    queryFn: () => apiGet<BusinessHours[]>("/settings/business-hours"),
  });

  const [days, setDays] = useState<BusinessHours[]>([]);

  useEffect(() => {
    if (query.data) {
      setDays([...query.data].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: BusinessHours[]) =>
      apiPut<BusinessHours[]>("/settings/business-hours", {
        days: payload.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isOpen: day.isOpen,
          openTime: day.openTime,
          closeTime: day.closeTime,
        })),
      }),
    onSuccess: () => {
      toast.success("Business hours saved");
      void queryClient.invalidateQueries({ queryKey: ["settings", "business-hours"] });
    },
    onError: (error) => toast.error("Couldn't save business hours", { description: parseApiError(error).message }),
  });

  function update(index: number, patch: Partial<BusinessHours>) {
    setDays((prev) => prev.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  }

  if (query.isLoading) return <LoadingState label="Loading business hours…" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load business hours"
        message={parseApiError(query.error).message}
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {days.map((day, index) => (
          <div key={day.dayOfWeek} className="grid items-center gap-3 rounded-md border border-border p-3 sm:grid-cols-[140px_auto_1fr_1fr]">
            <span className="text-sm font-medium text-ink">{DAY_NAMES[day.dayOfWeek]}</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={day.isOpen}
                disabled={!canManage}
                onCheckedChange={(checked) => update(index, { isOpen: checked })}
              />
              <span className="text-xs text-ink-500">{day.isOpen ? "Open" : "Closed"}</span>
            </div>
            <Input
              type="time"
              value={day.openTime}
              disabled={!canManage || !day.isOpen}
              onChange={(event) => update(index, { openTime: event.target.value })}
              aria-label={`${DAY_NAMES[day.dayOfWeek]} opening time`}
            />
            <Input
              type="time"
              value={day.closeTime}
              disabled={!canManage || !day.isOpen}
              onChange={(event) => update(index, { closeTime: event.target.value })}
              aria-label={`${DAY_NAMES[day.dayOfWeek]} closing time`}
            />
          </div>
        ))}
        {canManage && (
          <div className="flex justify-end pt-2">
            <Button variant="gold" disabled={saveMutation.isPending || days.length === 0} onClick={() => saveMutation.mutate(days)}>
              <Save /> {saveMutation.isPending ? "Saving…" : "Save hours"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Page ------------------------------------- */

export default function AdminSettingsPage() {
  usePageMeta("Settings", "Salon, booking, payment and SMTP config.");
  const { can } = usePermission();
  const canManage = can("settings.manage");

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.get<{ data: SalonSettingsFull; integrations: IntegrationFlags }>("/settings");
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Salon profile, booking rules, payments and integrations." />

      {!canManage && (
        <p className="rounded-md border border-warning/30 bg-warning-soft/50 px-4 py-2 text-sm text-warning">
          You have read-only access to settings.
        </p>
      )}

      {query.isLoading ? (
        <LoadingState label="Loading settings…" />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load settings"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : query.data ? (
        <Tabs defaultValue="configuration" className="space-y-6">
          <TabsList>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="hours">Business hours</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <SettingsForm
              settings={query.data.data}
              integrations={query.data.integrations}
              canManage={canManage}
            />
          </TabsContent>
          <TabsContent value="hours">
            <BusinessHoursCard canManage={canManage} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
