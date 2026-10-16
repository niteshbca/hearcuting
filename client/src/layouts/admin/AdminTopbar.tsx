import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BellRing, LogOut, Menu, Search, ShieldCheck, UserRound, UserSquare2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiGetList, apiPost } from "@/services/api";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AdminTopbarProps {
  onMenuClick: () => void;
}

export function AdminTopbar({ onMenuClick }: AdminTopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");

  const { data: notifData, refetch } = useQuery({
    queryKey: ["notifications", "topbar"],
    queryFn: () => apiGetList<Notification>("/notifications", { limit: 8 }),
    enabled: Boolean(user),
    staleTime: 30 * 1000,
    retry: 0,
  });

  const unread = (notifData?.data ?? []).filter((n) => !n.isRead).length;

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/admin/appointments?q=${encodeURIComponent(trimmed)}` : "/admin/appointments");
  }

  async function markAllRead() {
    try {
      await apiPost<void>("/notifications/read-all");
      void refetch();
    } catch {
      /* ignore */
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <form onSubmit={submitSearch} role="search" className="min-w-0 flex-1 sm:max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search appointments…"
            aria-label="Search appointments"
            className="pl-9"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {user && (
          <Badge variant="gold" className="hidden capitalize sm:inline-flex">
            {user.role}
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <span className="relative">
                <BellRing className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-[11px] font-normal normal-case text-gold-dark hover:underline"
                >
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(notifData?.data ?? []).length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-400">You're all caught up.</p>
            ) : (
              (notifData?.data ?? []).map((n) => (
                <DropdownMenuItem key={n.id} className="items-start gap-3 py-2.5" asChild>
                  <Link to={n.link ?? "/admin/notifications"}>
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.isRead ? "bg-ink-200" : "bg-gold"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-ink-500">{n.body}</span>}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/admin/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-ink-100"
              aria-label="User menu"
            >
              <Avatar src={user?.avatar} name={user?.name ?? ""} className="h-8 w-8 text-xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-medium text-ink">{user?.name}</span>
              <span className="block truncate text-xs font-normal text-ink-400">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/staff/profile">
                <UserRound className="h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            {user && user.role !== "customer" && (
              <DropdownMenuItem asChild>
                <Link to="/staff">
                  <UserSquare2 className="h-4 w-4" /> Switch to staff view
                </Link>
              </DropdownMenuItem>
            )}
            {user && user.role !== "customer" && (
              <DropdownMenuItem asChild>
                <Link to="/dashboard">
                  <ShieldCheck className="h-4 w-4" /> Customer view
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={() => {
                void logout();
              }}
            >
              <LogOut className="h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default AdminTopbar;
