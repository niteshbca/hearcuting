import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

const SUB_NAV = [
  { to: "/dashboard", label: "Overview", end: true },
  { to: "/dashboard/bookings", label: "My Bookings", end: false },
  { to: "/dashboard/profile", label: "Profile", end: false },
];

export function DashboardLayout() {
  const { user } = useAuth();

  return (
    <div className="bg-cream/40">
      <div className="border-b border-border bg-white">
        <div className="container-x py-8">
          <PageHeader
            eyebrow="My Account"
            title={`Welcome back${user ? `, ${user.name.split(" ")[0]}` : ""}`}
            subtitle="Manage your bookings, profile and preferences."
          />
        </div>
        <div className="container-x">
          <nav aria-label="Dashboard" className="-mb-px flex gap-6">
            {SUB_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-ink-500 transition-colors hover:text-ink",
                    isActive && "border-gold text-ink",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="container-x max-w-5xl py-10">
        <Outlet />
      </div>

      <div className="container-x max-w-5xl pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-5">
          <p className="text-sm text-ink-500">Need a new appointment?</p>
          <Button asChild variant="gold" size="sm">
            <Link to="/book">Book Now</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
