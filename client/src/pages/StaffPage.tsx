import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Scissors, Users } from "lucide-react";
import { usePublicStaff } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { StaffProfile } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";

function servedServices(staff: StaffProfile): string[] {
  return (staff.services ?? [])
    .map((s) => (typeof s === "string" ? "" : s.name))
    .filter((name): name is string => Boolean(name));
}

export default function StaffDirectoryPage() {
  usePageMeta("Our Team", "Meet the barbers and stylists at SalonPro.");

  const { data, isLoading, isError, refetch } = usePublicStaff();
  const [search, setSearch] = useState("");

  const staff = data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter((member) =>
      [
        member.name,
        member.role,
        ...(member.specialties ?? []),
        ...servedServices(member),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [staff, search]);

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="The team"
        title="Our team"
        subtitle="Skilled barbers and stylists ready to bring your next look to life."
      />

      {staff.length > 0 && (
        <div className="flex justify-end">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or specialty…"
            className="sm:max-w-xs"
          />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading team…" />
      ) : isError ? (
        <ErrorState message="We couldn't load our team right now." onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={staff.length ? "No team members match your search" : "Our directory is coming soon"}
          description={
            staff.length
              ? "Try a different name or specialty."
              : "We're putting the finishing touches on our team page."
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => {
            const services = servedServices(member);
            return (
              <Card key={member.id} className="card-hover flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col items-center p-6 text-center">
                  <Avatar
                    src={member.photoUrl}
                    name={member.name}
                    className="h-24 w-24 border-2 border-gold/40 text-xl"
                  />
                  <h2 className="mt-4 font-display text-xl text-ink">{member.name}</h2>
                  <Badge variant="gold" className="mt-2 capitalize">
                    {member.role}
                  </Badge>

                  {member.specialties?.length > 0 && (
                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      {member.specialties.map((specialty) => (
                        <Badge key={specialty} variant="outline">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {services.length > 0 && (
                    <div className="mt-5 w-full border-t border-border pt-4 text-left">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                        <Scissors className="h-3.5 w-3.5" /> Services
                      </p>
                      <p className="mt-1.5 text-sm text-ink-500">{services.slice(0, 4).join(" · ")}</p>
                    </div>
                  )}

                  <Button asChild variant="gold" className="mt-6 w-full">
                    <Link to="/book">
                      <CalendarCheck className="h-4 w-4" /> Book with {member.name.split(" ")[0]}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
