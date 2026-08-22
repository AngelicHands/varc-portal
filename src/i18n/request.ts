import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { routing } from "./routing";
import { PORTAL_LOCALE_HEADER } from "@/lib/portal-locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const header = (await headers()).get(PORTAL_LOCALE_HEADER);
  const locale = hasLocale(routing.locales, header)
    ? header
    : hasLocale(routing.locales, requested)
      ? requested
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
