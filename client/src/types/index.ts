export type Role = "owner" | "manager" | "receptionist" | "barber" | "accountant" | "customer";

export type BookingStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";

export type PaymentStatus = "unpaid" | "deposit_paid" | "paid" | "partially_paid" | "refunded";

export type BookingSource = "website" | "phone" | "walk_in" | "admin";

export type InvoiceStatus = "draft" | "unpaid" | "partially_paid" | "paid" | "refunded" | "void";

export type LeaveStatus = "pending" | "approved" | "rejected";

export type PaymentMethod = "cash" | "upi" | "card" | "online" | "voucher" | "membership";

export type PaymentRecordStatus = "pending" | "captured" | "failed" | "refunded" | "partially_refunded";

export type NotificationType = string;

export type EmailStatus = "queued" | "sending" | "sent" | "failed" | "retrying";

export type InventoryTxType = "in" | "out" | "adjustment" | "sale" | "waste";

export type DiscountType = "percent" | "fixed";

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  avatar?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  customerId?: string;
  staffId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: User;
}

/* ------------------------------- Service ------------------------------- */

export type ServiceCategory =
  | "Haircut"
  | "Beard"
  | "Hair Care"
  | "Facial"
  | "Coloring"
  | "Styling"
  | "Spa"
  | "Other";

export interface ServiceBookingRules {
  minNoticeHours: number;
  maxAdvanceDays: number;
  allowGuest: boolean;
  requireApproval: boolean;
  onlinePaymentAllowed: boolean;
}

export interface Service {
  id: string;
  _id?: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  imageUrls: string[];
  price: number;
  discountPrice?: number | null;
  durationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
  staff: string[];
  bookingRules: ServiceBookingRules;
  sortOrder: number;
  upcomingAppointments?: number;
  createdAt?: string;
  updatedAt?: string;
}

/* -------------------------------- Staff -------------------------------- */

export interface StaffBreak {
  start: string;
  end: string;
}

export interface WeeklyScheduleEntry {
  day: number;
  isWorking: boolean;
  start: string;
  end: string;
  breaks: StaffBreak[];
}

export interface StaffProfile {
  id: string;
  _id?: string;
  user?: string;
  name: string;
  email: string;
  phone: string;
  photoUrl?: string;
  role: "barber" | "manager" | "receptionist" | "accountant";
  specialties: string[];
  services: Array<string | Pick<Service, "id" | "name" | "category">>;
  weeklySchedule: WeeklyScheduleEntry[];
  employmentType: "full_time" | "part_time" | "contract";
  salary?: number;
  commissionPercent?: number;
  isActive: boolean;
  joiningDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffLeave {
  id: string;
  _id?: string;
  staff: string | Pick<StaffProfile, "id" | "name">;
  startDate: string;
  endDate: string;
  type: "paid" | "unpaid" | "sick" | "other";
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewNote?: string;
  createdAt?: string;
}

export interface StaffPerformance {
  staffId: string;
  name?: string;
  completedServices?: number;
  completed?: number;
  revenue: number;
  commission: number;
  commissionPercent?: number;
  appointments?: number;
  period?: { from: string; to: string };
}

/* ------------------------------- Customer ------------------------------ */

export interface CustomerProfile {
  id: string;
  _id?: string;
  user?: string;
  name: string;
  email: string;
  phone: string;
  gender?: "male" | "female" | "other";
  birthday?: string;
  notes?: string;
  notesVisibility?: "owner" | "owner_manager";
  tags: string[];
  preferredStaff?: string | Pick<StaffProfile, "id" | "name">;
  totalVisits: number;
  totalSpent: number;
  noShowCount: number;
  lastVisitAt?: string | null;
  lastVisit?: string | null;
  isActive: boolean;
  marketingOptIn: boolean;
  source: BookingSource;
  createdAt?: string;
  updatedAt?: string;
}

/* ------------------------------ Appointment ---------------------------- */

export interface AppointmentSnapshot {
  name: string;
  category: string;
  price: number;
  durationMinutes: number;
}

export interface RescheduleEntry {
  fromStart: string;
  toStart: string;
  at: string;
  reason?: string;
  byRole?: string;
}

export interface Appointment {
  id: string;
  _id?: string;
  reference: string;
  customer?: CustomerProfile | string | null;
  customerUser?: string;
  guest?: { name: string; email: string; phone: string };
  staff?: StaffProfile | string | null;
  service?: string;
  serviceSnapshot: AppointmentSnapshot;
  date: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  source: BookingSource;
  totalPrice: number;
  depositAmount: number;
  notes?: string;
  serviceNotes?: string;
  internalNotes?: string;
  cancelledAt?: string;
  cancelReason?: string;
  completedAt?: string;
  invoice?: string;
  rescheduleHistory?: RescheduleEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AppointmentAllowedActions {
  canReschedule: boolean;
  canCancel: boolean;
  canPay: boolean;
}

export interface BookingSlot {
  startsAt: string;
  time: string;
  staffIds: string[];
}

export interface AvailabilitySlotsResult {
  slots: BookingSlot[];
  staffId: string;
  serviceId: string;
  durationMinutes: number;
  date: string;
  reason?: string;
}

export interface StaffDay {
  staffId: string;
  date: string;
  windows: { start: string; end: string }[];
  busy: { start: string; end: string }[];
  appointments: Appointment[];
}

/* ------------------------------ Business hours ------------------------- */

export interface BusinessHours {
  id?: string;
  _id?: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

/* -------------------------------- Invoice ------------------------------ */

export interface InvoiceItem {
  type: "service" | "product";
  refId?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  staff?: string | Pick<StaffProfile, "id" | "name">;
  membershipRedemptionId?: string;
}

export interface InvoicePaymentRecord {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentRecordStatus;
  reference?: string;
  paidAt?: string;
  refundedAmount?: number;
}

export interface Invoice {
  id: string;
  _id?: string;
  invoiceNumber: string;
  customer?: CustomerProfile | string | null;
  customerUser?: string;
  appointment?: Appointment | string | null;
  items: InvoiceItem[];
  subtotal: number;
  discount: { type: DiscountType; value: number; amount: number };
  tax: { rate: number; amount: number };
  total: number;
  amountPaid: number;
  balanceDue: number;
  refundedAmount: number;
  status: InvoiceStatus;
  notes?: string;
  createdBy?: string;
  issuedAt: string;
  payments?: Payment[];
  createdAt?: string;
  updatedAt?: string;
}

/* -------------------------------- Payment ------------------------------ */

export interface Payment {
  id: string;
  _id?: string;
  invoice?: string;
  appointment?: string;
  customer?: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentRecordStatus;
  provider: "manual" | "razorpay" | "voucher" | "membership";
  providerOrderId?: string;
  providerPaymentId?: string;
  reference?: string;
  refundedAmount: number;
  notes?: string;
  paidAt: string;
  createdAt?: string;
}

/* -------------------------------- Product ------------------------------ */

export interface Product {
  id: string;
  _id?: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
  description: string;
  imageUrls: string[];
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isRetail: boolean;
  isActive: boolean;
  suppliers: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  _id?: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface InventoryTransaction {
  id: string;
  _id?: string;
  product: string | Pick<Product, "id" | "name" | "sku">;
  type: InventoryTxType;
  quantity: number;
  balanceAfter: number;
  refType?: string;
  refId?: string;
  unitCost?: number;
  notes?: string;
  createdAt: string;
}

/* ------------------------------ Membership ----------------------------- */

export interface MembershipPlanInclude {
  service?: string;
  serviceName?: string;
  limitTotal: number;
  discountPercent?: number;
}

export interface MembershipPlan {
  id: string;
  _id?: string;
  name: string;
  slug: string;
  type: "membership" | "package";
  description: string;
  price: number;
  validityDays: number;
  includes: MembershipPlanInclude[];
  credits?: number;
  isActive: boolean;
  sortWeight: number;
  createdAt?: string;
}

export interface MembershipInclude {
  service?: string;
  serviceName?: string;
  limitTotal: number;
  limitUsed: number;
  discountPercent?: number;
}

export interface Membership {
  id: string;
  _id?: string;
  customer: string | Pick<CustomerProfile, "id" | "name" | "email" | "phone">;
  plan?: string | Pick<MembershipPlan, "id" | "name" | "type">;
  name: string;
  type: "membership" | "package";
  code: string;
  price: number;
  validFrom: string;
  validUntil: string;
  credits: number;
  includes: MembershipInclude[];
  status: "active" | "expired" | "exhausted" | "cancelled";
  purchaseInvoice?: string;
  autoRenew: boolean;
  createdAt?: string;
}

export interface PackageRedemption {
  id: string;
  membership: string;
  customer: string;
  service?: string;
  appointment?: string;
  invoice?: string;
  value: number;
  remainingAfter?: { service?: string; count: number } | null;
  notes?: string;
  createdAt: string;
}

/* -------------------------------- Expense ------------------------------ */

export type ExpenseCategory =
  | "rent"
  | "electricity"
  | "salaries"
  | "supplies"
  | "maintenance"
  | "marketing"
  | "other";

export interface Expense {
  id: string;
  _id?: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string;
  vendor?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  attachmentUrl?: string;
  recordedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/* ----------------------------- Notification ---------------------------- */

export interface Notification {
  id: string;
  _id?: string;
  user?: string;
  role?: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  link?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface EmailDeliveryLog {
  id: string;
  _id?: string;
  to: string;
  toName?: string;
  subject: string;
  template: string;
  relatedType?: string;
  relatedId?: string;
  status: EmailStatus;
  transport: "smtp" | "json";
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  sentAt?: string | null;
  createdAt: string;
}

/* -------------------------------- Review ------------------------------- */

export interface Review {
  id: string;
  _id?: string;
  name: string;
  rating: number;
  comment: string;
  avatarUrl?: string;
  source: "website" | "google" | "manual";
  isPublished: boolean;
  createdAt: string;
}

/* -------------------------------- Audit -------------------------------- */

export interface AuditLog {
  id: string;
  _id?: string;
  actor?: string | Pick<User, "id" | "name" | "email">;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: string;
}

/* -------------------------------- Reports ------------------------------ */

export interface SeriesPoint {
  date: string;
  bookings?: number;
  cancellations?: number;
  revenue?: number;
}

export interface StaffAvailabilityStat {
  staffId: string;
  name: string;
  onLeave: boolean;
  working: boolean;
  windows: { start: string; end: string; breaks?: StaffBreak[] }[];
  bookedCount: number;
  nextAppointmentAt: string | null;
}

export interface PopularService {
  serviceId: string | null;
  name: string;
  count: number;
}

export interface DashboardData {
  scope: "all" | "barber";
  period: { from: string; to: string };
  today: { date: string; appointments: number; upcoming: Appointment[] };
  counts: {
    totalBookings: number;
    completedServices: number;
    pendingConfirmations: number;
    cancellations: number;
    noShows: number;
  };
  customers: { new: number; returning: number };
  staffAvailability: StaffAvailabilityStat[];
  popularServices: PopularService[];
  series: { bookings: SeriesPoint[]; revenue: SeriesPoint[] | null };
  sales?: { daily: number; monthly: number } | null;
  expenses?: number | null;
  estimatedProfit?: number | null;
  estimatedProfitNote?: string;
  barber?: {
    upcomingAppointments: Appointment[];
    completedToday: number;
  };
}

/* -------------------------- Public site settings ----------------------- */

export interface BookingRules {
  autoConfirm: boolean;
  allowGuest: boolean;
  maxAdvanceDays: number;
  minNoticeHours: number;
  slotIntervalMinutes: number;
  requireDeposit: boolean;
  depositPercent: number;
  rescheduleCutoffHours: number;
  cancelCutoffHours: number;
  noShowFeePercent: number;
  cancellationPolicyText: string;
}

export interface SalonAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  geo?: { lat: number; lng: number };
}

/** Raw shape returned by `GET /public/settings` (server `PublicSettings`). */
export interface ServerPublicSettings {
  salonName: string;
  tagline: string;
  logoUrl: string;
  address: SalonAddress;
  phone: string;
  whatsapp: string;
  email: string;
  social: { instagram?: string; facebook?: string; youtube?: string };
  currency: { code: string; symbol: string };
  timezone: string;
  aboutText: string;
  heroImages: string[];
  galleryImages: { url: string; caption?: string; category?: string }[];
  booking: BookingRules;
  payments: { onlinePaymentsEnabled: boolean; showPrices: boolean };
  privacyPolicyText: string;
  termsText: string;
}

/**
 * Normalized client-side settings used by the UI. Produced by `usePublicSettings`
 * from `ServerPublicSettings`, so components stay decoupled from server field names.
 */
export interface SalonSettingsPublic {
  salonName: string;
  tagline: string;
  logoUrl: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  whatsapp: string;
  email: string;
  social: { instagram?: string; facebook?: string; youtube?: string };
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  aboutText: string;
  heroImages: string[];
  galleryImages: { url: string; caption?: string; category?: string }[];
  booking: BookingRules;
  payments: { onlinePaymentsEnabled: boolean; showPrices: boolean };
  privacyPolicyText: string;
  termsText: string;
}

export interface SalonSettingsFull {
  id?: string;
  _id?: string;
  salonName: string;
  tagline: string;
  logoUrl: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
    geo?: { lat: number; lng: number };
  };
  phone: string;
  whatsapp: string;
  email: string;
  social: { instagram?: string; facebook?: string; youtube?: string };
  currency: { code: string; symbol: string };
  timezone: string;
  aboutText: string;
  heroImages: string[];
  galleryImages: { url: string; caption?: string; category?: string }[];
  booking: BookingRules & { bufferMinutes: number };
  notifications: { emailEnabled: boolean; remindersEnabled: boolean; remindersHoursBefore: number };
  payments: { onlinePaymentsEnabled: boolean; showPrices: boolean };
  privacyPolicyText: string;
  termsText: string;
}

export interface IntegrationFlags {
  smtpConfigured: boolean;
  razorpayConfigured: boolean;
  cloudinaryConfigured: boolean;
  uploadProvider: "cloudinary" | "local";
}

export interface FullSettingsResponse {
  data: SalonSettingsFull;
  integrations: IntegrationFlags;
}

export interface UploadConfig {
  provider: "cloudinary" | "local";
  cloudName?: string;
  uploadPreset?: string;
  maxSizeMb: number;
  uploadUrl?: string;
}

/* ------------------------------- Misc ---------------------------------- */

export interface CustomerSummary {
  customer: CustomerProfile;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalSpent: number;
  outstanding: number;
  lastVisitAt?: string | null;
  memberships?: Membership[];
  recentAppointments?: Appointment[];
}

export interface CustomerSegment {
  key: string;
  label: string;
  count: number;
}

export interface BookingPayload {
  serviceId: string;
  staffId?: string;
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  guest?: boolean;
}

export interface BookingResult {
  appointment: Appointment;
  bookingReference: string;
  managementToken?: string;
  payment?: {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
  };
}

export function entityId(value: { id?: string; _id?: string } | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.id ?? value._id ?? "";
}

export function personName(
  value: CustomerProfile | StaffProfile | Pick<User, "name"> | string | null | undefined,
): string {
  if (!value) return "";
  if (typeof value === "string") return "";
  return value.name ?? "";
}
