import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AdminSidebar } from "@/layouts/admin/AdminSidebar";
import { AdminTopbar } from "@/layouts/admin/AdminTopbar";

const STORAGE_KEY = "salonpro.admin.sidebar.collapsed";
const VERSION = "v1.0.0";

export function AdminLayout() {
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
          collapsed ? "w-[68px]" : "w-60",
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
        <AdminSidebar collapsed={collapsed} />
        <div className="absolute bottom-0 w-full border-t border-border bg-white px-4 py-3">
          <p className={cn("text-[11px] text-ink-400", collapsed && "text-center")}>
            {collapsed ? VERSION : `SalonPro CRM ${VERSION}`}
          </p>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <div className="flex h-16 items-center border-b border-border px-4">
            <Link to="/" className="font-display text-lg text-ink" onClick={() => setMobileOpen(false)}>
              Salon<span className="text-gold-dark">Pro</span> Admin
            </Link>
          </div>
          <AdminSidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onMenuClick={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
