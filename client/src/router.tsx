import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";

import PublicLayout from "@/layouts/PublicLayout";
import DashboardLayout from "@/layouts/DashboardLayout";
import AdminLayout from "@/layouts/admin/AdminLayout";
import StaffGate from "@/layouts/staff/StaffGate";
import { RequireAuth, RequireRole } from "@/components/auth/RequireAuth";

/* Public */
const Home = lazy(() => import("@/pages/Home"));
const About = lazy(() => import("@/pages/About"));
const Services = lazy(() => import("@/pages/Services"));
const Gallery = lazy(() => import("@/pages/Gallery"));
const Memberships = lazy(() => import("@/pages/Memberships"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const Contact = lazy(() => import("@/pages/Contact"));
const Book = lazy(() => import("@/pages/Book"));
const BookService = lazy(() => import("@/pages/BookService"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const CancellationPolicy = lazy(() => import("@/pages/CancellationPolicy"));
const BookingConfirmation = lazy(() => import("@/pages/BookingConfirmation"));
const GuestManage = lazy(() => import("@/pages/GuestManage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/* Admin (standalone) */
const AdminLogin = lazy(() => import("@/pages/admin/AdminLogin"));

/* Admin */
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminAppointments = lazy(() => import("@/pages/admin/Appointments"));
const AdminCustomers = lazy(() => import("@/pages/admin/Customers"));
const AdminCustomerDetail = lazy(() => import("@/pages/admin/CustomerDetail"));
const AdminStaff = lazy(() => import("@/pages/admin/Staff"));
const AdminStaffDetail = lazy(() => import("@/pages/admin/StaffDetail"));
const AdminServices = lazy(() => import("@/pages/admin/Services"));
const AdminInvoices = lazy(() => import("@/pages/admin/Invoices"));
const AdminInvoiceDetail = lazy(() => import("@/pages/admin/InvoiceDetail"));
const AdminPos = lazy(() => import("@/pages/admin/Pos"));
const AdminProducts = lazy(() => import("@/pages/admin/Products"));
const AdminInventory = lazy(() => import("@/pages/admin/Inventory"));
const AdminMemberships = lazy(() => import("@/pages/admin/Memberships"));
const AdminExpenses = lazy(() => import("@/pages/admin/Expenses"));
const AdminReports = lazy(() => import("@/pages/admin/Reports"));
const AdminNotifications = lazy(() => import("@/pages/admin/Notifications"));
const AdminAudit = lazy(() => import("@/pages/admin/Audit"));
const AdminSettings = lazy(() => import("@/pages/admin/Settings"));

/* Customer portal */
const DashboardHome = lazy(() => import("@/pages/customer/DashboardHome"));
const DashboardBookings = lazy(() => import("@/pages/customer/Bookings"));
const DashboardBookingDetail = lazy(() => import("@/pages/customer/BookingDetail"));
const DashboardProfile = lazy(() => import("@/pages/customer/Profile"));

/* Staff portal */
const StaffToday = lazy(() => import("@/pages/staff/Today"));
const StaffCalendar = lazy(() => import("@/pages/staff/Calendar"));
const StaffPerformance = lazy(() => import("@/pages/staff/Performance"));
const StaffLeave = lazy(() => import("@/pages/staff/Leave"));
const StaffProfile = lazy(() => import("@/pages/staff/StaffProfile"));

const STAFF_ONLY = ["owner", "manager", "receptionist", "accountant"] as const;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <PublicLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "about", element: <About /> },
      { path: "services", element: <Services /> },
      { path: "gallery", element: <Gallery /> },
      { path: "memberships", element: <Memberships /> },
      { path: "reviews", element: <Reviews /> },
      { path: "contact", element: <Contact /> },
      { path: "book", element: <Book /> },
      { path: "book/:serviceId", element: <BookService /> },
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      { path: "privacy", element: <Privacy /> },
      { path: "terms", element: <Terms /> },
      { path: "cancellation-policy", element: <CancellationPolicy /> },
      { path: "booking/:reference", element: <BookingConfirmation /> },
      { path: "booking/:reference/manage", element: <GuestManage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "/admin/login", element: <AdminLogin /> },
  {
    path: "/dashboard",
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardHome /> },
      { path: "bookings", element: <DashboardBookings /> },
      { path: "bookings/:reference", element: <DashboardBookingDetail /> },
      { path: "profile", element: <DashboardProfile /> },
    ],
  },
  {
    /* role hints: dashboard=any staff, appointments=all staff, customers/POS/invoices=receptionist+,
       reports/expenses/accountant finance, settings/audit=owner/manager — enforced per route below */
    path: "/admin",
    element: (
      <RequireRole roles={[...STAFF_ONLY]}>
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      /* appointments: owner, manager, receptionist, accountant (read) */
      { path: "appointments", element: <AdminAppointments /> },
      /* customers: owner, manager, receptionist */
      { path: "customers", element: <AdminCustomers /> },
      { path: "customers/:id", element: <AdminCustomerDetail /> },
      /* staff: owner, manager */
      { path: "staff", element: <AdminStaff /> },
      { path: "staff/:id", element: <AdminStaffDetail /> },
      /* services: owner, manager */
      { path: "services", element: <AdminServices /> },
      /* invoices: owner, manager, receptionist, accountant */
      { path: "invoices", element: <AdminInvoices /> },
      { path: "invoices/:id", element: <AdminInvoiceDetail /> },
      /* pos: owner, manager, receptionist */
      { path: "pos", element: <AdminPos /> },
      /* products/inventory: owner, manager (+read accountant via perm) */
      { path: "products", element: <AdminProducts /> },
      { path: "inventory", element: <AdminInventory /> },
      /* memberships: owner, manager, receptionist */
      { path: "memberships", element: <AdminMemberships /> },
      /* expenses: owner, manager, accountant */
      { path: "expenses", element: <AdminExpenses /> },
      /* reports: owner, manager, accountant */
      { path: "reports", element: <AdminReports /> },
      { path: "notifications", element: <AdminNotifications /> },
      /* audit: owner only (server enforced) */
      { path: "audit", element: <AdminAudit /> },
      /* settings: owner only (server enforced) */
      { path: "settings", element: <AdminSettings /> },
    ],
  },
  {
    /* /staff is shared: staff get the portal, everyone else the public directory (see StaffGate) */
    path: "/staff",
    element: <StaffGate />,
    children: [
      { index: true, element: <StaffToday /> },
      { path: "calendar", element: <StaffCalendar /> },
      { path: "performance", element: <StaffPerformance /> },
      { path: "leave", element: <StaffLeave /> },
      { path: "profile", element: <StaffProfile /> },
    ],
  },
]);

export default router;
