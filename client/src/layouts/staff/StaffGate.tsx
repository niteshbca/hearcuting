import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FullPageSpinner } from "@/components/ui/spinner";
import { PublicLayout } from "@/layouts/PublicLayout";
import { StaffLayout } from "@/layouts/staff/StaffLayout";
import StaffDirectoryPage from "@/pages/StaffPage";
import type { Role } from "@/types";

const PORTAL_ROLES: Role[] = ["owner", "manager", "receptionist", "accountant", "barber"];

/**
 * `/staff` is shared: verified staff see the StaffLayout portal (Today/Calendar/…),
 * while guests and customers see the public staff directory.
 * Non-staff deep-links (e.g. /staff/calendar) fall back to the public directory.
 */
export function StaffGate() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;

  if (user && PORTAL_ROLES.includes(user.role)) {
    return <StaffLayout />;
  }

  if (location.pathname !== "/staff") {
    return <Navigate to="/staff" replace />;
  }

  return (
    <PublicLayout>
      <StaffDirectoryPage />
    </PublicLayout>
  );
}

export default StaffGate;
