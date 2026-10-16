import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Phone, UserRound } from "lucide-react";
import { apiGet, apiPatch } from "@/services/api";
import type { StaffProfile } from "@/types";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseApiError } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number"),
  specialties: z.string().max(600).optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

function serviceName(service: { name: string } | string): string {
  return typeof service === "string" ? service : service.name;
}

export default function StaffProfilePage() {
  usePageMeta("Profile", "Manage your contact details and specialties.");
  const queryClient = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["staff-me"],
    queryFn: () => apiGet<StaffProfile>("/staff/me"),
  });

  const { control, handleSubmit, reset } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { phone: "", specialties: "" },
  });

  const profile = query.data;

  useEffect(() => {
    if (!profile) return;
    reset({
      phone: profile.phone,
      specialties: (profile.specialties ?? []).join(", "),
    });
    setPhotoUrl(profile.photoUrl || null);
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      apiPatch<StaffProfile>(`/staff/${profile?.id}`, {
        phone: values.phone,
        specialties: (values.specialties ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        photoUrl: photoUrl ?? "",
      }),
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-me"] });
    },
    onError: (error) =>
      toast.error("Couldn't update profile", { description: parseApiError(error).message }),
  });

  if (query.isLoading) {
    return <LoadingState label="Loading profile…" minHeight="16rem" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load your profile"
        message={parseApiError(query.error).message}
        onRetry={() => query.refetch()}
      />
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="My profile" subtitle="Keep your contact details and specialties up to date." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-cream">
              {photoUrl ? (
                <img src={photoUrl} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-10 w-10 text-ink-400" />
              )}
            </span>
            <div>
              <p className="font-display text-lg text-ink">{profile.name}</p>
              <Badge variant="gold" className="mt-1 capitalize">
                {profile.role}
              </Badge>
            </div>
            <div className="w-full space-y-1 text-sm text-ink-500">
              <p className="flex items-center justify-center gap-2">
                <Mail className="h-4 w-4" /> {profile.email}
              </p>
              <p className="flex items-center justify-center gap-2">
                <Phone className="h-4 w-4" /> {profile.phone}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Badge variant="muted" className="capitalize">
                {profile.employmentType.replace(/_/g, " ")}
              </Badge>
              {profile.joiningDate && (
                <Badge variant="muted">Joined {new Date(profile.joiningDate).getFullYear()}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Edit details</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
              className="grid gap-4"
              noValidate
            >
              <ImageUpload label="Profile photo" value={photoUrl} onChange={setPhotoUrl} />
              <FormField
                control={control}
                name="phone"
                label="Phone"
                required
                render={(field) => <Input {...field} />}
              />
              <FormField
                control={control}
                name="specialties"
                label="Specialties"
                description="Comma-separated, e.g. Fades, Beard trim, Colour"
                render={(field) => <Input {...field} />}
              />
              {profile.services && profile.services.length > 0 && (
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium text-ink">Services offered</span>
                  <div className="flex flex-wrap gap-2">
                    {profile.services.map((service, index) => (
                      <Badge key={index} variant="muted">
                        {serviceName(service)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Button type="submit" variant="gold" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
