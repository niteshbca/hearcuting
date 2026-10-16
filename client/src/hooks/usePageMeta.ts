import { useEffect } from "react";

const DEFAULT_TITLE = "SalonPro — Premium Hair Salon & Barbershop";
const DEFAULT_DESCRIPTION =
  "SalonPro — premium hair salon & barbershop experience. Book expert barbers and stylists, manage memberships, and enjoy effortless grooming reservations.";

function setMetaContent(selector: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const match = selector.match(/^meta\[name="(.+)"\]$/) ?? selector.match(/^meta\[property="(.+)"\]$/);
    if (match && match[1]) {
      if (selector.startsWith("meta[property")) {
        el.setAttribute("property", match[1]);
      } else {
        el.setAttribute("name", match[1]);
      }
    }
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} · SalonPro` : DEFAULT_TITLE;
    setMetaContent('meta[name="description"]', description ?? DEFAULT_DESCRIPTION);
    setMetaContent('meta[property="og:title"]', title ? `${title} · SalonPro` : DEFAULT_TITLE);
    setMetaContent('meta[property="og:description"]', description ?? DEFAULT_DESCRIPTION);
    return () => {
      document.title = previousTitle || DEFAULT_TITLE;
    };
  }, [title, description]);
}

export default usePageMeta;
