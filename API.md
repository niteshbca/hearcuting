# SalonPro API Contract (v1)

Base URL: `http://localhost:4000/api` (dev) — production same-origin via reverse proxy.
All responses JSON. Success: `{ "data": ... }` (optionally `meta` for lists). Error: `{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": []? } }`.
Auth: HttpOnly cookies `sp_at` (access, 15m) + `sp_rt` (refresh, 30d, path `/api/auth`) + readable `sp_csrf`.
Mutating requests MUST send header `x-csrf-token` (value of `sp_csrf` cookie). All sessions also require a valid CSRF cookie pair.
Pagination query: `?page=1&limit=20&search=&sort=-createdAt` → `meta: { page, limit, total, totalPages }`.
List endpoints return `{ data: [...], meta }`.

## Conventions
- Roles: `owner | manager | receptionist | barber | accountant | customer`
- Permissions listed per route; `*` = public; `auth` = any valid session; `perm:X` = permission X required.
- Booking statuses: `pending | confirmed | in_progress | completed | cancelled | no_show`
- Payment statuses: `unpaid | deposit_paid | paid | refunded | partially_paid`
- Invoice statuses: `draft | unpaid | partially_paid | paid | refunded | void`
- Dates: appointment `date` = `YYYY-MM-DD` in salon timezone; `startsAt`/`endsAt` = ISO UTC.
- Never trust client-sent price/role/payment status — server recomputes.

## AUTH — `/api/auth`
| Method | Path | Access | Body/Notes |
|---|---|---|---|
| GET | `/csrf` | * | Issues `sp_csrf` cookie → `{ data: { csrfToken } }` |
| POST | `/register` | * | `{ name, email, phone, password }` → creates CustomerProfile + user role `customer` |
| POST | `/login` | * | `{ email, password }` → sets cookies → `{ data: { user } }`. Rate-limited. |
| POST | `/refresh` | * (rt cookie) | Rotates refresh token → new cookies |
| POST | `/logout` | auth | Clears cookies, revokes session |
| GET | `/me` | auth | `{ data: { user: { id, name, email, role, customerId?, staffId?, avatar? } } }` or 401 |
| POST | `/forgot-password` | * | `{ email }` → always 200; sends reset email if user exists |
| POST | `/reset-password` | * | `{ token, password }` → revokes all sessions |
| POST | `/change-password` | auth | `{ currentPassword, newPassword }` → revokes other sessions |
| POST | `/revoke-sessions` | auth | Logs out everywhere except current |

## PUBLIC SITE — `/api/public`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/settings` | * | Public salon settings (name, logo, address, phone, whatsapp, social, hero, gallery, about, seo, booking rules: allowGuest, maxAdvanceDays, minNoticeHours, autoConfirm, requireDeposit, depositPercent, cancellation policy text, currency, timezone) — NO secrets |
| GET | `/services` | * | Active services `{ data: Service[] }` (`?search=&category=`) |
| GET | `/staff` | * | Active barbers with photo, specialties, services |
| GET | `/reviews` | * | Published reviews |
| GET | `/plans` | * | Active membership plans/offerings (from MembershipPlan docs) |

## SERVICES — `/api/services`
| Method | Path | Access |
|---|---|---|
| GET | `/` | auth (barber+: all; customers see active) |
| POST | `/` | perm:services.manage |
| GET | `/:id` | auth |
| PATCH | `/:id` | perm:services.manage |
| PATCH | `/:id/status` | perm:services.manage (activate/deactivate) |

## STAFF — `/api/staff`
| Method | Path | Access |
|---|---|---|
| GET | `/` | perm:staff.view (`?search=&isActive=`) |
| POST | `/` | perm:staff.manage — creates User (role barber/manager/receptionist/accountant) + StaffProfile; returns one-time `invitePassword` or email invite |
| GET | `/me` | auth (staff) → own profile + schedule |
| GET | `/:id` | perm:staff.view or own |
| PATCH | `/:id` | perm:staff.manage or own (limited fields) |
| PATCH | `/:id/schedule` | perm:staff.manage — weeklySchedule + breaks |
| PATCH | `/:id/status` | perm:staff.manage |
| GET | `/:id/performance` | own or perm:staff.view — completed services, revenue, commissions (period query) |
| GET | `/:id/leaves` / POST `/:id/leaves` | own (barber: create pending) / perm:staff.manage |
| GET | `/leaves` | perm:staff.view (`?status=&staffId=`) |
| PATCH | `/leaves/:id` | perm:staff.manage (approve/reject) |

## AVAILABILITY — `/api/availability`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/slots` | * | `?serviceId&date=YYYY-MM-DD&staffId?=any` → `{ data: { slots: [{ startsAt, endsAt, staffIds: [] }], date, serviceId, durationMinutes } }` |
| GET | `/staff-day` | auth(staff/owner) | `?staffId&date` → own working windows + appointments (calendar) |
| GET | `/calendar` | perm:appointments.view | `?from=YYYY-MM-DD&to=YYYY-MM-DD&staffId?=` → appointments for calendar views |

## APPOINTMENTS — `/api/appointments`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/` | * (rate-limited) | Public/guest booking. Body: `{ serviceId, staffId? ("any"), date, startsAt?, slotTime "HH:mm", name, email, phone, notes?, guest:true? }`. Server validates availability, computes price, creates appointment (status per autoConfirm setting: `confirmed` or `pending`), sends emails. If `requireDeposit` + online payments: response includes `payment: { orderId, amount, currency, keyId }`. Returns `{ data: { appointment, bookingReference, managementToken? , payment? } }` — `managementToken` only for guest bookings. |
| GET | `/mine` | auth(customer) | Own bookings (paginated, `?status=`) |
| GET | `/:reference` | auth | Owner/staff/customer (scoped) or with token |
| GET | `/:reference/manage` | * | Query `?token=` → appointment + allowed actions (for guests) |
| POST | `/:reference/reschedule` | * | `{ token? , date, slotTime, staffId? }` — policy cutoff enforced server-side |
| POST | `/:reference/cancel` | * | `{ token?, reason? }` |
| GET | `/` | perm:appointments.view | List `?page&search&status&paymentStatus&staffId&from&to&source` (scoped: barber→own, customer→own) |
| POST | `/walk-in` | perm:appointments.create (owner/manager/receptionist) | `{ customerId? or customer:{name,email,phone}, serviceIds[], staffId, date, slotTime, notes? }` |
| PATCH | `/:id/status` | perm:appointments.update | `{ status, serviceNotes?, reason? }` — barber limited to own + allowed transitions |
| PATCH | `/:id/assign` | perm:appointments.assign | `{ staffId }` — notifies staff |
| PATCH | `/:id` | perm:appointments.update | Reschedule/assign/notes by staff (admin) |
| GET | `/:id/history` | perm:appointments.view | Audit trail for appointment |
| POST | `/:id/remind` | perm:appointments.update | Send reminder now (test) |

## INVOICES — `/api/invoices`
| Method | Path | Access |
|---|---|---|
| GET | `/` | perm:invoices.view `?page&search&status&from&to&staffId` |
| GET | `/:id` | perm:invoices.view (or customer own) |
| POST | `/` | perm:invoices.create — POS/billing: `{ appointmentId? , customerId?, items: [{ type:'service'|'product', refId?, name, quantity, unitPrice?, staffId? }], discount?: {type,value}, taxRate?, payments?: [{method,amount}], notes? }` → server recomputes prices, deducts inventory for products, redeems membership if requested (`membershipId?` per item or top-level) |
| POST | `/:id/refund` | perm:payments.refund `{ amount, reason }` |
| GET | `/:id/print` | perm:invoices.view → printable invoice payload |

## PAYMENTS — `/api/payments`
| Method | Path | Access |
|---|---|---|
| GET | `/` | perm:payments.view `?from&to&method&status` |
| POST | `/:invoiceId` | perm:payments.record `{ method, amount, reference? }` |
| POST | `/online/create-order` | auth-or-guest via appointmentReference `{ appointmentReference }` → Razorpay order (if enabled) |
| POST | `/online/verify` | * `{ appointmentReference, orderId, paymentId, signature }` → server HMAC verify → marks paid (idempotent) |
| POST | `/webhook/razorpay` | * raw body, signature verified, idempotent via PaymentWebhookEvent |
| POST | `/:id/refund` | perm:payments.refund |

## PRODUCTS / INVENTORY — `/api/products`, `/api/inventory`
| Method | Path | Access |
|---|---|---|
| GET/POST/PATCH | `/api/products` (+`/:id`) | view: perm:products.view; write: perm:products.manage |
| GET | `/api/products/low-stock` | perm:products.view |
| GET/POST | `/api/inventory/suppliers` (+`/:id` PATCH) | perm:inventory.manage (GET: inventory.view) |
| GET | `/api/inventory/transactions` | perm:inventory.view `?productId&type&from&to` |
| POST | `/api/inventory/stock` | perm:inventory.manage `{ productId, type:'in'\|'out'\|'adjustment', quantity, unitCost?, refType?, notes }` |
| GET | `/api/inventory/stock-report` | perm:inventory.view |

## MEMBERSHIPS — `/api/memberships`
| Method | Path | Access |
|---|---|---|
| GET | `/plans` | perm:memberships.manage (public active plans via /api/public/plans) |
| POST | `/plans` | perm:memberships.manage |
| PATCH | `/plans/:id` | perm:memberships.manage |
| GET | `/` | perm:memberships.view `?customerId&status` |
| POST | `/` | perm:memberships.manage — purchase/assign `{ customerId, planId, ... }` → invoice |
| GET | `/customer/:customerId` | own customer or perm:memberships.view |
| POST | `/:id/redeem` | perm:memberships.redeem `{ serviceId, appointmentId?, invoiceId? }` → server validates balance |
| POST | `/renew/:id` | perm:memberships.manage |
| GET | `/redemptions` | perm:memberships.view |

## EXPENSES — `/api/expenses`
| Method | Path | Access |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/expenses` (+`/:id`) | perm:expenses.manage (GET also expenses.view) `?category&from&to` |

## CUSTOMERS (CRM) — `/api/customers`
| Method | Path | Access |
|---|---|---|
| GET | `/` | perm:customers.view `?page&search&tag&from&to` → includes lastVisit, totalVisits, totalSpent |
| POST | `/` | perm:customers.create |
| GET | `/:id` | perm:customers.view or own (customer role, `me` alias) |
| PATCH | `/:id` | perm:customers.update or own (limited fields) |
| GET | `/:id/bookings` | perm:customers.view or own |
| GET | `/:id/invoices` | perm:invoices.view or own |
| GET | `/:id/summary` | perm:customers.view or own |
| POST | `/:id/notes` | perm:customers.notes (owner/manager only) |
| GET | `/segments` | perm:customers.view |

## REPORTS — `/api/reports`
| Method | Path | Access |
|---|---|---|
| GET | `/dashboard` | auth (role-scoped) → today's counts, sales, expenses, profit estimate, new vs returning, staff availability, popular services, upcoming appointments, 30-day bookings/revenue series |
| GET | `/sales` | perm:reports.view `?from&to&groupBy=day\|week\|month` |
| GET | `/services` | perm:reports.view — service-wise revenue/counts |
| GET | `/staff` | perm:reports.view — staff completed services + commission |
| GET | `/bookings` | perm:reports.view — booking/cancellation/no-show stats |
| GET | `/customers` | perm:customers.view — retention, new vs returning |
| GET | `/inventory` | perm:inventory.view |
| GET | `/expenses` | perm:expenses.view |
| GET | `/outstanding` | perm:reports.financial |
| GET | `/profit` | perm:reports.financial |
| GET | `/:name/export` | perm:reports.view → `text/csv` |

## SETTINGS — `/api/settings`
| Method | Path | Access |
|---|---|---|
| GET | `/` | auth → full settings (owner/manager see SMTP/payment flags) |
| PATCH | `/` | perm:settings.manage |
| GET | `/upload-config` | auth → `{ provider:'cloudinary'|'local', cloudName?, uploadPreset? }` |
| POST | `/audit` upload handled by `/api/uploads` |

## UPLOADS — `/api/uploads`
| Method | Path | Access |
|---|---|---|
| POST | `/` | auth — multipart `file` (image ≤5MB, jpeg/png/webp/gif) → `{ data: { url } }` (served from `/uploads`) |

## NOTIFICATIONS — `/api/notifications`
| Method | Path | Access |
|---|---|---|
| GET | `/` | auth → own notifications (paginated, `?unreadOnly`) |
| PATCH | `/:id/read` | auth own |
| POST | `/read-all` | auth |
| GET | `/email-logs` | perm:notifications.view (owner/manager) → EmailDeliveryLog `?status&page` |
| POST | `/email-logs/:id/retry` | perm:notifications.view |

## REVIEWS — `/api/reviews`
| Method | Path | Access |
|---|---|---|
| GET | `/` | * `?published=true` |
| POST | `/` | * rate-limited — `{ name, rating, comment }` (creates unpublished unless setting) |
| PATCH | `/:id` / DELETE | perm:reviews.manage |

## AUDIT — `/api/audit`
| Method | Path | Access |
|---|---|---|
| GET | `/` | perm:audit.view `?page&action&entity&from&to` |

## Roles → permissions (summary)
- **owner**: all
- **manager**: all except `settings.manage`, `audit.view`, `users.manage`
- **receptionist**: appointments.*, customers.view/create/update, services.view, invoices.create/view, payments.record, memberships.view/redeem, products.view, availability
- **barber**: appointments.view.own, appointments.update.status.own (own appointments, status→in_progress/completed + serviceNotes), staff.view.own, staff.performance.own, leaves.own, services.view, availability.own, notifications.own
- **accountant**: invoices.*, payments.*, expenses.*, reports.view, reports.financial, products.view, customers.view (read), appointments.view (read)
- **customer**: own profile/bookings/invoices/memberships only
