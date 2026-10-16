import { Clock, Facebook, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/shared/FormField";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  email: z.string().trim().email("Enter a valid email"),
  message: z.string().trim().min(5, "Please write a short message").max(2000),
});

type FormValues = z.infer<typeof schema>;

export default function ContactPage() {
  usePageMeta("Contact", "Reach SalonPro by phone, WhatsApp, email or visit us.");

  const { settings } = usePublicSettings();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", message: "" },
  });

  function onSubmit(values: FormValues) {
    const to = settings.email || "";
    const subject = encodeURIComponent(`Website enquiry from ${values.name}`);
    const body = encodeURIComponent(`${values.message}\n\n— ${values.name} (${values.email})`);
    if (to) {
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      toast.success("Opening your email app…");
      reset();
    } else {
      toast.error("Contact email is not configured", {
        description: "Please reach us by phone or WhatsApp instead.",
      });
    }
  }

  const hasSocial = settings.social.instagram || settings.social.facebook || settings.social.youtube;

  return (
    <div className="container-x space-y-10 py-12">
      <PageHeader
        eyebrow="Get in touch"
        title="Contact us"
        subtitle="Questions about a service, a booking or a membership? We're happy to help."
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-5 p-6">
              <h2 className="font-display text-lg text-ink">Visit or call</h2>
              <ul className="space-y-4 text-sm">
                {settings.address && (
                  <li className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <span className="text-ink-600">
                      {settings.address}
                      {settings.city ? <>, {settings.city}</> : null}
                      {settings.country ? <>, {settings.country}</> : null}
                    </span>
                  </li>
                )}
                {settings.phone && (
                  <li className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark">
                      <Phone className="h-5 w-5" />
                    </span>
                    <a href={`tel:${settings.phone}`} className="text-ink-600 hover:text-gold-dark">
                      {settings.phone}
                    </a>
                  </li>
                )}
                {settings.whatsapp && (
                  <li className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <a
                      href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-600 hover:text-success"
                    >
                      Chat on WhatsApp
                    </a>
                  </li>
                )}
                {settings.email && (
                  <li className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-dark">
                      <Mail className="h-5 w-5" />
                    </span>
                    <a href={`mailto:${settings.email}`} className="text-ink-600 hover:text-gold-dark">
                      {settings.email}
                    </a>
                  </li>
                )}
                <li className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
                    <Clock className="h-5 w-5" />
                  </span>
                  <span className="text-ink-600">
                    Booking window: up to {settings.booking.maxAdvanceDays} days in advance ·
                    {" "}
                    min. {settings.booking.minNoticeHours}h notice
                  </span>
                </li>
              </ul>

              {hasSocial && (
                <div className="flex items-center gap-3 border-t border-border pt-5">
                  <span className="text-sm text-ink-500">Follow us</span>
                  {settings.social.instagram && (
                    <a href={settings.social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="text-ink-400 hover:text-gold-dark">
                      <Instagram className="h-5 w-5" />
                    </a>
                  )}
                  {settings.social.facebook && (
                    <a href={settings.social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="text-ink-400 hover:text-gold-dark">
                      <Facebook className="h-5 w-5" />
                    </a>
                  )}
                  {settings.social.youtube && (
                    <a href={settings.social.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="text-ink-400 hover:text-gold-dark">
                      <Youtube className="h-5 w-5" />
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-5 p-6">
            <div>
              <h2 className="font-display text-lg text-ink">Send us a message</h2>
              <p className="mt-1 text-sm text-ink-500">
                Fill this in and we&apos;ll open your email app with the details ready to send.
              </p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <FormField
                control={control}
                name="name"
                label="Your name"
                required
                render={(field) => (
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={String(field.value ?? "")}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                )}
              />
              <FormField
                control={control}
                name="email"
                label="Email"
                required
                render={(field) => (
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={String(field.value ?? "")}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                )}
              />
              <FormField
                control={control}
                name="message"
                label="Message"
                required
                render={(field) => (
                  <Textarea
                    id="message"
                    rows={5}
                    placeholder="How can we help?"
                    value={String(field.value ?? "")}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                )}
              />
              <Button type="submit" variant="gold" className="w-full" disabled={isSubmitting}>
                Send message
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
