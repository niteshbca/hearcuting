import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sparkles } from "lucide-react";
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

const schema = z
  .object({
    name: z.string().min(2, "Enter your full name"),
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
    phone: z.string().min(7, "Enter a valid phone number"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

function strengthOf(password: string): { score: number; label: string; className: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (!password) return { score: 0, label: "", className: "" };
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const classes = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"];
  return { score, label: labels[score], className: classes[score] };
}

function BrandPanel() {
  return (
    <aside className="relative hidden w-full overflow-hidden bg-ink lg:w-1/2 lg:block">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 75% 25%, rgba(198,161,91,0.35) 0%, transparent 45%), radial-gradient(circle at 25% 80%, rgba(169,133,63,0.3) 0%, transparent 40%)",
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">Join the salon</p>
          <h2 className="mt-4 max-w-md font-display text-4xl leading-tight text-white">
            Your chair is waiting. <span className="italic text-gold-light">Book it your way.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
            Create a free account to track bookings, rebook in one tap and keep every visit on record.
          </p>
        </div>
        <ul className="flex gap-6 text-sm text-white/50">
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" /> Faster rebooking</li>
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" /> Visit history</li>
        </ul>
      </div>
    </aside>
  );
}

export default function RegisterPage() {
  usePageMeta("Create Account");
  const { register: signUp, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: string } | null)?.from ??
    new URLSearchParams(location.search).get("from") ??
    "/dashboard";

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", password: "", confirm: "" },
  });

  const password = watch("password");
  const strength = strengthOf(password);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const account = await signUp({
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
      });
      toast.success(`Welcome, ${account.name.split(" ")[0]}`);
      navigate(from, { replace: true });
    } catch (error) {
      const { message } = parseApiError(error);
      toast.error("Registration failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />
      <main className="flex w-full items-center justify-center px-5 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-dark">Create account</p>
          <h1 className="mt-2 font-display text-3xl text-ink">Look sharp from day one</h1>
          <p className="mt-2 text-sm text-ink-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-gold-dark underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" autoComplete="name" placeholder="Aarav Sharma" {...register("name")} />
              {errors.name && <p role="alert" className="text-xs font-medium text-danger">{errors.name.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && <p role="alert" className="text-xs font-medium text-danger">{errors.email.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" {...register("phone")} />
              {errors.phone && <p role="alert" className="text-xs font-medium text-danger">{errors.phone.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  className="pr-10"
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
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i < strength.score ? strength.className : "bg-ink-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-ink-400">Strength: {strength.label}</p>
                </div>
              )}
              {errors.password && (
                <p role="alert" className="text-xs font-medium text-danger">{errors.password.message}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat password"
                {...register("confirm")}
              />
              {errors.confirm && (
                <p role="alert" className="text-xs font-medium text-danger">{errors.confirm.message}</p>
              )}
            </div>

            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
