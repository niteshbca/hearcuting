import { ShieldCheck } from "lucide-react";
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

export default function PrivacyPage() {
  usePageMeta("Privacy Policy", "How SalonPro collects, uses and protects your personal data.");

  const { settings, isLoading } = usePublicSettings();

  const fallback = `This Privacy Policy explains how ${settings.salonName || "our salon"} collects, uses and protects the personal information you share with us when you browse our website or make a booking.

We collect only the details needed to deliver our services — such as your name, contact information and appointment preferences. We never sell your data to third parties.

We use industry-standard safeguards to protect your information and retain it only for as long as necessary to provide our services or comply with the law.

You may request access to, correction of, or deletion of your personal data at any time by contacting us.

By using our website and services, you consent to the practices described in this policy.`;

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle="Your trust matters. Here's how we handle your information."
      />
      <Card>
        <CardContent className="flex gap-4 p-6 sm:p-8">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark sm:flex">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="flex-1">
            {isLoading ? (
              <LoadingState label="Loading policy…" minHeight="8rem" />
            ) : (
              <Paragraphs text={settings.privacyPolicyText || fallback} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
