import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { PORTAL_LOCALE_HEADER } from "@/lib/portal-locale";

export async function portalLocaleFromHeaders(
  fallback: string,
): Promise<AppLocale> {
  const header = (await headers()).get(PORTAL_LOCALE_HEADER);
  if (hasLocale(routing.locales, header)) return header;
  if (hasLocale(routing.locales, fallback)) return fallback;
  return routing.defaultLocale;
}
