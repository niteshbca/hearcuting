import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
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

export default function AdminLoginPage() {
  usePageMeta("Admin Sign In");
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (!loading && user) {
    return <Navigate to="/admin" replace />;
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const account = await login(values.email, values.password);
      toast.success(`Signed in as ${account.name}`);
      navigate("/admin", { replace: true });
    } catch (error) {
      const { code, message } = parseApiError(error);
      if (code === "RATE_LIMITED" || code === "HTTP_429") {
        toast.error("Too many attempts", { description: "Please wait a moment before trying again." });
      } else {
        toast.error("Sign in failed", { description: message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-5 py-12">
      <div className="absolute inset-0 opacity-40" aria-hidden="true">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 10%, rgba(198,161,91,0.25) 0%, transparent 45%), radial-gradient(circle at 70% 85%, rgba(169,133,63,0.2) 0%, transparent 40%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-xl border border-gold/25 bg-ink-800 p-8 shadow-lift sm:p-10">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gold text-ink">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">SalonPro CRM</p>
            <h1 className="mt-2 font-display text-2xl text-white">Staff sign in</h1>
            <p className="mt-2 text-sm text-white/50">Access the salon floor, POS and reports.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
            <div className="grid gap-1.5">
              <Label htmlFor="admin-email" className="text-white/70">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                placeholder="you@salonpro.com"
                className="border-white/15 bg-ink-700 text-white placeholder:text-white/35 focus:border-gold"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email && <p role="alert" className="text-xs font-medium text-danger">{errors.email.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="admin-password" className="text-white/70">Password</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="border-white/15 bg-ink-700 pr-10 text-white placeholder:text-white/35 focus:border-gold"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="text-xs font-medium text-danger">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Verifying…" : "Sign in"}
            </Button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-white/40">
          <Link to="/" className="hover:text-gold">← Back to website</Link>
          <Link to="/login" className="hover:text-gold">Customer sign in</Link>
        </div>
      </div>
    </div>
  );
}
