import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  CalendarDays,
  CalendarOff,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STORAGE_KEY = "salonpro.staff.sidebar.collapsed";

interface StaffNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: StaffNavItem[] = [
  { to: "/staff", label: "Today", icon: Sun, end: true },
  { to: "/staff/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/staff/performance", label: "Performance", icon: TrendingUp },
  { to: "/staff/leave", label: "Leave", icon: CalendarOff },
  { to: "/staff/profile", label: "Profile", icon: UserRound },
];

function StaffNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Staff navigation" className="flex flex-col gap-1 px-3 py-4">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                isActive ? "bg-ink text-white" : "text-ink-600 hover:bg-cream hover:text-ink",
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function StaffLayout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex min-h-screen w-full bg-cream/40">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-white transition-[width] duration-200 md:block",
          collapsed ? "w-[68px]" : "w-56",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!collapsed && (
            <Link to="/" className="font-display text-lg tracking-tight text-ink">
              Salon<span className="text-gold-dark">Pro</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
        <StaffNav collapsed={collapsed} />
        <div className="absolute bottom-0 w-full border-t border-border bg-white px-4 py-3">
          <p className={cn("text-[11px] text-ink-400", collapsed && "text-center")}>
            {collapsed ? "v1.0.0" : "Staff Portal v1.0.0"}
          </p>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Staff navigation</SheetTitle>
          <div className="flex h-16 items-center border-b border-border px-4">
            <Link to="/" className="font-display text-lg text-ink" onClick={() => setMobileOpen(false)}>
              Salon<span className="text-gold-dark">Pro</span>
            </Link>
          </div>
          <StaffNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <p className="font-display text-base text-ink">Staff Portal</p>
          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-0.5 hover:bg-ink-100" aria-label="User menu">
                  <Avatar name={user?.name ?? ""} className="h-8 w-8 text-xs" />
                  <span className="hidden text-sm font-medium sm:inline">{user?.name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm font-medium text-ink">{user?.name}</span>
                  <span className="block truncate text-xs font-normal text-ink-400">
                    {user?.email}
                    {user ? ` · ${initials(user.name)}` : ""}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/staff/profile">
                    <UserRound className="h-4 w-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <Sun className="h-4 w-4" /> Customer view
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => void logout()}>
                  <LogOut className="h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default StaffLayout;
