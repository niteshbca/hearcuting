import { FileText } from "lucide-react";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-600">
      {text
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) => (
          <p key={index} className="whitespace-pre-line">
            {block}
          </p>
        ))}
    </div>
  );
}

export default function TermsPage() {
  usePageMeta("Terms of Service", "The terms and conditions for using SalonPro and booking appointments.");

  const { settings, isLoading } = usePublicSettings();

  const fallback = `These Terms of Service govern your use of the ${settings.salonName || "SalonPro"} website and services. By booking an appointment or using our site, you agree to these terms.

Appointments are subject to availability and may require a deposit. Prices shown are indicative and may vary based on your selected service and any applicable offers.

You agree to provide accurate contact information and to arrive on time for your appointment. Repeated no-shows may affect your ability to book in future.

We may update these terms from time to time. Continued use of our services after changes are posted constitutes acceptance of the updated terms.`;

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="Legal"
        title="Terms of Service"
        subtitle="The ground rules for using our site and booking with us."
      />
      <Card>
        <CardContent className="flex gap-4 p-6 sm:p-8">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark sm:flex">
            <FileText className="h-5 w-5" />
          </span>
          <div className="flex-1">
            {isLoading ? (
              <LoadingState label="Loading terms…" minHeight="8rem" />
            ) : (
              <Paragraphs text={settings.termsText || fallback} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
