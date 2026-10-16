import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LayoutDashboard, Scissors } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROLE_HOME } from "@/lib/permissions";
import { parseApiError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

function BrandPanel() {
  return (
    <aside className="relative hidden w-full overflow-hidden bg-ink lg:w-1/2 lg:block">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(198,161,91,0.35) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(169,133,63,0.3) 0%, transparent 40%)",
        }}
      />
      <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
            <span className="text-gold">▲</span>
          </span>
          <span className="font-display text-xl">SalonPro</span>
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">Welcome back</p>
          <h2 className="mt-4 max-w-md font-display text-4xl leading-tight text-white">
            Sharp cuts. Calm moments. <span className="italic text-gold-light">All in one place.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
            Sign in to manage appointments, invoices, staff and the entire salon floor from one premium workspace.
          </p>
        </div>
        <ul className="flex gap-6 text-sm text-white/50">
          <li className="flex items-center gap-2"><Scissors className="h-4 w-4 text-gold" /> Book in seconds</li>
          <li className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-gold" /> Full CRM access</li>
        </ul>
      </div>
    </aside>
  );
}

export default function LoginPage() {
  usePageMeta("Sign In");
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: string } | null)?.from ??
    new URLSearchParams(location.search).get("from") ??
    null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (user) {
    const target = from ?? ROLE_HOME[user.role] ?? "/";
    return <Navigate to={target} replace />;
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const account = await login(values.email, values.password);
      toast.success(`Welcome back, ${account.name.split(" ")[0]}`);
      navigate(from ?? ROLE_HOME[account.role] ?? "/", { replace: true });
    } catch (error) {
      const { message } = parseApiError(error);
      toast.error("Sign in failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />
      <main className="flex w-full items-center justify-center px-5 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-dark">Sign in</p>
          <h1 className="mt-2 font-display text-3xl text-ink">Good to see you</h1>
          <p className="mt-2 text-sm text-ink-500">
            New here?{" "}
            <Link to="/register" className="font-medium text-gold-dark underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email && <p role="alert" className="text-xs font-medium text-danger">{errors.email.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="text-xs font-medium text-danger">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-ink-400">
            Staff?{" "}
            <Link to="/admin/login" className="text-gold-dark hover:underline">
              Use the staff sign-in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
