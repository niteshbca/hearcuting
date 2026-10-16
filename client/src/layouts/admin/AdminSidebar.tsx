import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BellRing,
  Boxes,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Package,
  Receipt,
  Scissors,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/appointments", label: "Appointments", icon: CalendarDays },
      { to: "/admin/invoices", label: "Invoices", icon: Receipt },
      { to: "/admin/pos", label: "POS", icon: CreditCard },
      { to: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/admin/staff", label: "Staff", icon: UserCog },
      { to: "/admin/services", label: "Services", icon: Scissors },
    ],
  },
  {
    label: "Commerce",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/inventory", label: "Inventory", icon: Boxes },
      { to: "/admin/memberships", label: "Memberships", icon: CreditCard },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/expenses", label: "Expenses", icon: Wallet },
      { to: "/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/notifications", label: "Notifications", icon: BellRing },
      { to: "/admin/audit", label: "Audit", icon: ShieldCheck },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export interface AdminSidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
  className?: string;
}

export function AdminSidebar({ collapsed, onNavigate, className }: AdminSidebarProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Admin navigation"
        className={cn("flex h-full flex-col gap-6 overflow-y-auto px-3 py-4", className)}
      >
        {SECTIONS.map((section) => (
          <div key={section.label} className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center px-2",
                      isActive
                        ? "bg-ink text-white"
                        : "text-ink-600 hover:bg-cream hover:text-ink",
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );

              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

export default AdminSidebar;
