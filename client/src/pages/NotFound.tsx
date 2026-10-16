import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  usePageMeta("Page Not Found");
  return (
    <section className="container-x flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-display text-[7rem] leading-none text-transparent [-webkit-text-stroke:1.5px_#C6A15B]">404</p>
      <div className="mt-4 h-px w-28 bg-gradient-to-r from-transparent via-gold to-transparent" />
      <h1 className="mt-6 font-display text-3xl text-ink">This page slipped out of the chair</h1>
      <p className="mt-3 max-w-md text-sm text-ink-500">
        The link may be outdated, or the page has moved. Let's get you back to where it's sharp.
      </p>
      <Button asChild variant="gold" className="mt-8">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </Button>
    </section>
  );
}
