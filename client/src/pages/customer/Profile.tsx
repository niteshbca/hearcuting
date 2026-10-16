import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Mail, Phone, ShieldCheck, User as UserIcon } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/services/api";
import type { CustomerProfile, User } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const GENDER_VALUES = ["male", "female", "other", "unspecified"] as const;

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20, "Phone number is too long")
    .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number"),
  gender: z.enum(GENDER_VALUES),
  birthday: z.string().trim().optional(),
  marketingOptIn: z.boolean(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function DashboardProfilePage() {
  usePageMeta("My Profile", "Manage your personal details and password.");
  const { user: sessionUser, refreshMe } = useAuth();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<{ user: User }>("/auth/me"),
  });
  const user = meQuery.data?.user ?? sessionUser;

  const customerQuery = useQuery({
    queryKey: ["customer", "me"],
    queryFn: () => apiGet<CustomerProfile>("/customers/me"),
    enabled: Boolean(user?.customerId),
  });

  const {
    control: profileControl,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      phone: "",
      gender: "unspecified",
      birthday: "",
      marketingOptIn: false,
    },
  });

  useEffect(() => {
    const profile = customerQuery.data;
    if (!profile) return;
    resetProfile({
      name: profile.name ?? "",
      phone: profile.phone ?? "",
      gender: profile.gender ?? "unspecified",
      birthday: profile.birthday ?? "",
      marketingOptIn: profile.marketingOptIn ?? false,
    });
  }, [customerQuery.data, resetProfile]);

  const saveProfile = useMutation({
    mutationFn: (values: ProfileFormValues) => {
      const body: Record<string, unknown> = {
        name: values.name,
        phone: values.phone,
        marketingOptIn: values.marketingOptIn,
      };
      if (values.gender !== "unspecified") body.gender = values.gender;
      if (values.birthday) body.birthday = values.birthday;
      return apiPatch<CustomerProfile>("/customers/me", body);
    },
    onSuccess: (profile) => {
      toast.success("Profile updated");
      queryClient.setQueryData(["customer", "me"], profile);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      void refreshMe();
    },
    onError: (error) =>
      toast.error("Couldn't update profile", { description: parseApiError(error).message }),
  });

  function onProfileSubmit(values: ProfileFormValues) {
    saveProfile.mutate(values);
  }

  const {
    control: passwordControl,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changePassword = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      apiPost<{ success: boolean }>("/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success("Password changed");
      resetPassword();
    },
    onError: (error) =>
      toast.error("Couldn't change password", { description: parseApiError(error).message }),
  });

  function onPasswordSubmit(values: PasswordFormValues) {
    changePassword.mutate(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        subtitle="Keep your contact details and password up to date."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-gold-dark" /> Personal details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meQuery.isLoading || (Boolean(user?.customerId) && customerQuery.isLoading) ? (
            <LoadingState label="Loading your profile…" />
          ) : customerQuery.isError ? (
            <ErrorState
              title="Couldn't load profile"
              message={parseApiError(customerQuery.error).message}
              onRetry={() => customerQuery.refetch()}
            />
          ) : (
            <form
              onSubmit={handleProfileSubmit(onProfileSubmit)}
              className="grid gap-5 sm:grid-cols-2"
              noValidate
            >
              <FormField
                control={profileControl}
                name="name"
                label="Full name"
                required
                render={(field) => <Input autoComplete="name" {...field} />}
              />
              <FormField
                control={profileControl}
                name="phone"
                label="Phone"
                required
                render={(field) => <Input autoComplete="tel" {...field} />}
              />
              <FormField
                control={profileControl}
                name="birthday"
                label="Birthday"
                render={(field) => <Input type="date" {...field} />}
              />
              <FormField
                control={profileControl}
                name="gender"
                label="Gender"
                render={(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspecified">Prefer not to say</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FormField
                control={profileControl}
                name="marketingOptIn"
                className="sm:col-span-2"
                render={(field) => (
                  <label className="flex items-center gap-3 text-sm text-ink-700">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    Send me offers, updates and appointment reminders by email.
                  </label>
                )}
              />
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="gold" disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gold-dark" /> Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-ink-400" />
            <span className="text-ink-700">{user?.email}</span>
          </div>
          {user?.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-ink-400" />
              <span className="text-ink-700">{user.phone}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gold-dark" /> Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handlePasswordSubmit(onPasswordSubmit)}
            className="grid gap-5 sm:grid-cols-3"
            noValidate
          >
            <FormField
              control={passwordControl}
              name="currentPassword"
              label="Current password"
              required
              render={(field) => <Input type="password" autoComplete="current-password" {...field} />}
            />
            <FormField
              control={passwordControl}
              name="newPassword"
              label="New password"
              required
              render={(field) => <Input type="password" autoComplete="new-password" {...field} />}
            />
            <FormField
              control={passwordControl}
              name="confirmPassword"
              label="Confirm new password"
              required
              render={(field) => <Input type="password" autoComplete="new-password" {...field} />}
            />
            <div className="flex justify-end sm:col-span-3">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
