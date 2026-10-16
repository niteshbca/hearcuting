import type { Role } from "@/types";

export type Permission =
  | "appointments.view"
  | "appointments.view.own"
  | "appointments.create"
  | "appointments.update"
  | "appointments.update.status.own"
  | "appointments.assign"
  | "customers.view"
  | "customers.create"
  | "customers.update"
  | "customers.notes"
  | "services.view"
  | "services.manage"
  | "staff.view"
  | "staff.view.own"
  | "staff.manage"
  | "staff.performance.own"
  | "leaves.own"
  | "leaves.manage"
  | "availability"
  | "availability.own"
  | "invoices.view"
  | "invoices.create"
  | "payments.view"
  | "payments.record"
  | "payments.refund"
  | "products.view"
  | "products.manage"
  | "inventory.view"
  | "inventory.manage"
  | "memberships.view"
  | "memberships.manage"
  | "memberships.redeem"
  | "expenses.view"
  | "expenses.manage"
  | "reports.view"
  | "reports.financial"
  | "settings.manage"
  | "audit.view"
  | "users.manage"
  | "notifications.view"
  | "notifications.own";

const ALL: Permission[] = [
  "appointments.view",
  "appointments.view.own",
  "appointments.create",
  "appointments.update",
  "appointments.update.status.own",
  "appointments.assign",
  "customers.view",
  "customers.create",
  "customers.update",
  "customers.notes",
  "services.view",
  "services.manage",
  "staff.view",
  "staff.view.own",
  "staff.manage",
  "staff.performance.own",
  "leaves.own",
  "leaves.manage",
  "availability",
  "availability.own",
  "invoices.view",
  "invoices.create",
  "payments.view",
  "payments.record",
  "payments.refund",
  "products.view",
  "products.manage",
  "inventory.view",
  "inventory.manage",
  "memberships.view",
  "memberships.manage",
  "memberships.redeem",
  "expenses.view",
  "expenses.manage",
  "reports.view",
  "reports.financial",
  "settings.manage",
  "audit.view",
  "users.manage",
  "notifications.view",
  "notifications.own",
];

const MANAGER_EXCLUDED: Permission[] = ["settings.manage", "audit.view", "users.manage"];

const RECEPTIONIST: Permission[] = [
  "appointments.view",
  "appointments.create",
  "appointments.update",
  "appointments.assign",
  "customers.view",
  "customers.create",
  "customers.update",
  "services.view",
  "invoices.view",
  "invoices.create",
  "payments.record",
  "memberships.view",
  "memberships.redeem",
  "products.view",
  "availability",
  "notifications.own",
];

const BARBER: Permission[] = [
  "appointments.view.own",
  "appointments.update.status.own",
  "staff.view.own",
  "staff.performance.own",
  "leaves.own",
  "services.view",
  "availability.own",
  "notifications.own",
  "customers.view",
];

const ACCOUNTANT: Permission[] = [
  "invoices.view",
  "invoices.create",
  "payments.view",
  "payments.record",
  "payments.refund",
  "expenses.view",
  "expenses.manage",
  "reports.view",
  "reports.financial",
  "products.view",
  "customers.view",
  "appointments.view",
  "notifications.own",
];

const CUSTOMER: Permission[] = ["notifications.own"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => !MANAGER_EXCLUDED.includes(p)),
  receptionist: RECEPTIONIST,
  barber: BARBER,
  accountant: ACCOUNTANT,
  customer: CUSTOMER,
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_HOME: Record<Role, string> = {
  owner: "/admin",
  manager: "/admin",
  receptionist: "/admin",
  accountant: "/admin",
  barber: "/staff",
  customer: "/dashboard",
};
