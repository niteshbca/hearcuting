import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronDown, Facebook, Instagram, LogOut, Menu, Phone, UserRound, Youtube } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/gallery", label: "Gallery" },
  { to: "/staff", label: "Staff" },
  { to: "/memberships", label: "Memberships" },
  { to: "/reviews", label: "Reviews" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

function Logo() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2" aria-label="SalonPro home">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink">
        <span className="text-sm leading-none text-gold">▲</span>
      </span>
      <span className="font-display text-xl tracking-tight text-ink">
        Salon<span className="text-gold-dark">Pro</span>
      </span>
    </Link>
  );
}

export function PublicLayout({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { settings } = usePublicSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur-md">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "gold-underline text-sm font-medium text-ink-500 transition-colors hover:text-ink",
                    isActive && "text-ink",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="gold" size="sm" className="hidden sm:inline-flex">
              <Link to="/book">Book Now</Link>
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-ink-100"
                    aria-label="Account menu"
                  >
                    <UserRound className="h-4 w-4" />
                    <span className="hidden max-w-[8rem] truncate sm:inline">{user.name.split(" ")[0]}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void logout();
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Login</Link>
              </Button>
            )}

            <Button asChild variant="ghost" size="sm" className="hidden text-ink-500 md:inline-flex">
              <Link to="/admin/login">Admin</Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {location.pathname === "/" && (
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        )}
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex flex-col">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="border-b border-border p-6">
            <Logo />
          </div>
          <nav aria-label="Mobile" className="flex flex-1 flex-col gap-1 p-4">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-cream",
                    isActive && "bg-cream text-ink",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="grid gap-2 border-t border-border p-6">
            <Button asChild variant="gold" onClick={() => setMobileOpen(false)}>
              <Link to="/book">Book Now</Link>
            </Button>
            <Button asChild variant="outline" onClick={() => setMobileOpen(false)}>
              <Link to="/admin/login">Admin</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main id="main" className="flex-1">
        {children ?? <Outlet />}
      </main>

      <footer className="border-t border-border bg-ink text-white/80">
        <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
                <span className="text-sm leading-none text-gold">▲</span>
              </span>
              <span className="font-display text-xl text-white">SalonPro</span>
            </span>
            <p className="text-sm leading-relaxed text-white/60">
              {settings.tagline || "Premium hair salon & barbershop experience."}
            </p>
            <div className="flex gap-3">
              {settings.social?.instagram && (
                <a href={settings.social.instagram} aria-label="Instagram" className="text-white/60 hover:text-gold">
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {settings.social?.facebook && (
                <a href={settings.social.facebook} aria-label="Facebook" className="text-white/60 hover:text-gold">
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {settings.social?.youtube && (
                <a href={settings.social.youtube} aria-label="YouTube" className="text-white/60 hover:text-gold">
                  <Youtube className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-display text-base text-white">Quick Links</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV_LINKS.slice(0, 6).map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-white/60 transition-colors hover:text-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base text-white">Services</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/services" className="text-white/60 hover:text-gold">Haircut & Styling</Link></li>
              <li><Link to="/services" className="text-white/60 hover:text-gold">Beard Grooming</Link></li>
              <li><Link to="/services" className="text-white/60 hover:text-gold">Coloring</Link></li>
              <li><Link to="/services" className="text-white/60 hover:text-gold">Spa & Treatments</Link></li>
              <li><Link to="/memberships" className="text-white/60 hover:text-gold">Memberships</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base text-white">Contact</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-white/60">
              {settings.address && <li>{settings.address}{settings.city ? `, ${settings.city}` : ""}</li>}
              {settings.phone && (
                <li>
                  <a href={`tel:${settings.phone}`} className="inline-flex items-center gap-2 hover:text-gold">
                    <Phone className="h-4 w-4" /> {settings.phone}
                  </a>
                </li>
              )}
              {settings.whatsapp && (
                <li>
                  <a
                    href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-gold"
                  >
                    WhatsApp us
                  </a>
                </li>
              )}
              {settings.email && (
                <li>
                  <a href={`mailto:${settings.email}`} className="hover:text-gold">{settings.email}</a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="container-x flex flex-col items-center justify-between gap-3 py-5 text-xs text-white/50 sm:flex-row">
            <p>© {new Date().getFullYear()} SalonPro. All rights reserved.</p>
            <div className="flex gap-5">
              <Link to="/privacy" className="hover:text-gold">Privacy</Link>
              <Link to="/terms" className="hover:text-gold">Terms</Link>
              <Link to="/cancellation-policy" className="hover:text-gold">Cancellation Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PublicLayout;
