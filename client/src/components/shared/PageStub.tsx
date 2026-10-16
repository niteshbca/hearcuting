import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePageMeta } from "@/hooks/usePageMeta";

export interface PageStubProps {
  title: string;
  subtitle?: string;
}

export function PageStub({ title, subtitle }: PageStubProps) {
  usePageMeta(title);
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState
        icon={ClipboardList}
        title="This section is being set up"
        description="We're putting the finishing touches on this area. Please check back shortly."
      />
    </div>
  );
}
