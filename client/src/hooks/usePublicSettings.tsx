import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet } from "@/services/api";
import type {
  SalonSettingsPublic,
  ServerPublicSettings,
  Service,
  StaffProfile,
} from "@/types";

export const DEFAULT_PUBLIC_SETTINGS: SalonSettingsPublic = {
  salonName: "SalonPro",
  tagline: "Premium Hair Salon & Barbershop",
  logoUrl: "",
  address: "",
  city: "",
  country: "India",
  phone: "",
  whatsapp: "",
  email: "",
  social: {},
  currencyCode: "INR",
  currencySymbol: "₹",
  timezone: "Asia/Kolkata",
  aboutText: "",
  heroImages: [],
  galleryImages: [],
  booking: {
    autoConfirm: true,
    allowGuest: true,
    maxAdvanceDays: 60,
    minNoticeHours: 2,
    slotIntervalMinutes: 15,
    requireDeposit: false,
    depositPercent: 20,
    rescheduleCutoffHours: 4,
    cancelCutoffHours: 2,
    noShowFeePercent: 50,
    cancellationPolicyText: "",
  },
  payments: { onlinePaymentsEnabled: false, showPrices: true },
  privacyPolicyText: "",
  termsText: "",
};

function mapSettings(raw: ServerPublicSettings): SalonSettingsPublic {
  const { address } = raw;
  const line = [address?.line1, address?.line2].filter(Boolean).join(", ");
  const cityLine = [address?.city, address?.state, address?.postalCode].filter(Boolean).join(", ");
  return {
    salonName: raw.salonName ?? "SalonPro",
    tagline: raw.tagline ?? "",
    logoUrl: raw.logoUrl ?? "",
    address: line,
    city: cityLine,
    country: address?.country ?? "",
    phone: raw.phone ?? "",
    whatsapp: raw.whatsapp ?? "",
    email: raw.email ?? "",
    social: raw.social ?? {},
    currencyCode: raw.currency?.code ?? "INR",
    currencySymbol: raw.currency?.symbol ?? "₹",
    timezone: raw.timezone ?? "Asia/Kolkata",
    aboutText: raw.aboutText ?? "",
    heroImages: raw.heroImages ?? [],
    galleryImages: raw.galleryImages ?? [],
    booking: raw.booking ?? DEFAULT_PUBLIC_SETTINGS.booking,
    payments: raw.payments ?? { onlinePaymentsEnabled: false, showPrices: true },
    privacyPolicyText: raw.privacyPolicyText ?? "",
    termsText: raw.termsText ?? "",
  };
}

export function usePublicSettings(): UseQueryResult<SalonSettingsPublic> & {
  settings: SalonSettingsPublic;
} {
  const query = useQuery<SalonSettingsPublic>({
    queryKey: ["public", "settings"],
    queryFn: async () => mapSettings(await apiGet<ServerPublicSettings>("/public/settings")),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return Object.assign(query, {
    settings: query.data ?? DEFAULT_PUBLIC_SETTINGS,
  });
}

export function usePublicServices(): UseQueryResult<Service[]> {
  return useQuery<Service[]>({
    queryKey: ["public", "services"],
    queryFn: () => apiGet<Service[]>("/public/services"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function usePublicStaff(): UseQueryResult<StaffProfile[]> {
  return useQuery<StaffProfile[]>({
    queryKey: ["public", "staff"],
    queryFn: () => apiGet<StaffProfile[]>("/public/staff"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
