import { CalendarClock, CalendarX, Clock, Wallet } from "lucide-react";
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

export default function CancellationPolicyPage() {
  usePageMeta(
    "Cancellation Policy",
    "Reschedule and cancellation windows for SalonPro appointments.",
  );

  const { settings, isLoading } = usePublicSettings();
  const { booking } = settings;

  const fallback = `We understand plans change. To keep our schedule fair for everyone, please let us know as early as possible if you need to reschedule or cancel.

You can reschedule your appointment up to ${booking.rescheduleCutoffHours} hours before your start time, and cancel up to ${booking.cancelCutoffHours} hours before.

Cancellations made within the notice window, or no-shows, may be subject to a fee of ${booking.noShowFeePercent}% of the service value. Any deposit paid may be adjusted accordingly.

To change or cancel a booking, use the management link in your confirmation email or contact us directly.`;

  const rows = [
    { icon: CalendarClock, label: "Reschedule notice", value: `${booking.rescheduleCutoffHours} hours before start` },
    { icon: CalendarX, label: "Cancellation notice", value: `${booking.cancelCutoffHours} hours before start` },
    { icon: Wallet, label: "No-show fee", value: `${booking.noShowFeePercent}% of service value` },
    {
      icon: Clock,
      label: "Deposit",
      value: booking.requireDeposit ? `${booking.depositPercent}% required at booking` : "Not required",
    },
  ];

  return (
    <div className="container-x space-y-8 py-12">
      <PageHeader
        eyebrow="Legal"
        title="Cancellation Policy"
        subtitle="Clear, fair rules for changing or cancelling your appointment."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="space-y-2 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-soft text-gold-dark">
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
              <p className="font-medium text-ink">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6 sm:p-8">
          {isLoading ? (
            <LoadingState label="Loading policy…" minHeight="8rem" />
          ) : (
            <Paragraphs text={booking.cancellationPolicyText || fallback} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
