export const ROLES = ['owner', 'manager', 'receptionist', 'barber', 'accountant', 'customer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard.view',
  'appointments.view',
  'appointments.create',
  'appointments.update',
  'appointments.update.own',
  'appointments.assign',
  'customers.view',
  'customers.create',
  'customers.update',
  'customers.notes',
  'customers.export',
  'services.view',
  'services.manage',
  'staff.view',
  'staff.manage',
  'staff.performance.view',
  'invoices.view',
  'invoices.create',
  'invoices.refund',
  'payments.view',
  'payments.record',
  'payments.refund',
  'products.view',
  'products.manage',
  'inventory.view',
  'inventory.manage',
  'memberships.view',
  'memberships.manage',
  'memberships.redeem',
  'expenses.view',
  'expenses.manage',
  'reports.view',
  'reports.financial',
  'settings.manage',
  'notifications.view',
  'audit.view',
  'reviews.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const MANAGER: Permission[] = ALL.filter((p) => !['settings.manage', 'audit.view'].includes(p));

const RECEPTIONIST: Permission[] = [
  'dashboard.view',
  'appointments.view',
  'appointments.create',
  'appointments.update',
  'appointments.assign',
  'customers.view',
  'customers.create',
  'customers.update',
  'services.view',
  'staff.view',
  'invoices.view',
  'invoices.create',
  'payments.view',
  'payments.record',
  'memberships.view',
  'memberships.redeem',
  'products.view',
];

const BARBER: Permission[] = [
  'appointments.view',
  'appointments.update.own',
  'services.view',
  'staff.performance.view',
];

const ACCOUNTANT: Permission[] = [
  'dashboard.view',
  'appointments.view',
  'customers.view',
  'invoices.view',
  'invoices.create',
  'invoices.refund',
  'payments.view',
  'payments.record',
  'payments.refund',
  'products.view',
  'inventory.view',
  'memberships.view',
  'expenses.view',
  'expenses.manage',
  'reports.view',
  'reports.financial',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[] | '*'> = {
  owner: '*',
  manager: MANAGER,
  receptionist: RECEPTIONIST,
  barber: BARBER,
  accountant: ACCOUNTANT,
  customer: [],
};

export function roleHasPermission(role: Role | string | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  if (perms === '*') return true;
  return perms.includes(permission);
}

export function isStaffRole(role: Role | string | undefined): boolean {
  return ['owner', 'manager', 'receptionist', 'barber', 'accountant'].includes(role ?? '');
}
