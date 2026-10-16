import type { ReactNode } from "react";
import { useAuth, usePermission } from "@/hooks/useAuth";
import type { Role } from "@/types";
import type { Permission } from "@/lib/permissions";

export interface PermissionGateProps {
  permission?: Permission;
  roles?: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ permission, roles, children, fallback = null }: PermissionGateProps) {
  const { user } = useAuth();
  const { can } = usePermission();

  if (!user) return <>{fallback}</>;
  if (roles && !roles.includes(user.role)) return <>{fallback}</>;
  if (permission && !can(permission)) return <>{fallback}</>;

  return <>{children}</>;
}
