/**
 * Registers every model in one place so Mongoose schemas are always loaded
 * before queries run and `createAllIndexes` covers all collections.
 */
export { User } from './User';
export { CustomerProfile } from './CustomerProfile';
export { StaffProfile } from './StaffProfile';
export { Service, serviceEffectivePrice } from './Service';
export { Appointment, BUSY_STATUSES } from './Appointment';
export type { AppointmentDoc, AppointmentStatus, PaymentStatus, BookingSource } from './Appointment';
export { BusinessHours, StaffAvailability, StaffLeave } from './Schedule';
export { Invoice } from './Invoice';
export type { InvoiceDoc, InvoiceItem, InvoiceStatus } from './Invoice';
export { Payment, PaymentWebhookEvent } from './Payment';
export type { PaymentDoc, PaymentMethod, PaymentRecordStatus } from './Payment';
export { Product, Supplier, InventoryTransaction } from './Inventory';
export { Membership, MembershipPlan, PackageRedemption } from './Membership';
export { Expense, Notification, EmailDeliveryLog, SalonSettings, Review, AuditLog } from './Salon';
export type { ExpenseDoc, EmailDeliveryLogDoc, SalonSettingsDoc } from './Salon';
