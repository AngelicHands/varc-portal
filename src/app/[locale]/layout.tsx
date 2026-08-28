import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { routing } from "@/i18n/routing";
import { portalLocaleFromHeaders } from "@/lib/portal-locale-server";
import { getPublicGoogleAnalyticsConfig, getPublicSiteBranding, listPublicMenuLinks } from "@/lib/cms";
import { isAdminRole } from "@/lib/roles";
import { contentViewerFromSession } from "@/lib/content-access";
import { PortalAnalytics } from "@/components/portal/portal-analytics";
import { SiteFooter } from "@/components/portal/site-footer";
import { SiteHeader } from "@/components/portal/site-header";
import { LocaleAlternatesProvider } from "@/components/portal/locale-alternates";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!hasLocale(routing.locales, localeParam)) return {};
  const locale = await portalLocaleFromHeaders(localeParam);

  const branding = await getPublicSiteBranding(locale);
  const siteName = branding.siteName;
  const siteTitle = branding.siteTitle;
  const description = branding.metaDescription || branding.tagline;
  const suffix = `${siteName} | ${siteTitle}`;
  // Point at the media URL directly — avoid /api/favicon on every document load.
  const iconUrl = branding.faviconUrl.trim() || "/api/favicon";

  return {
    title: {
      // Home: "{site name} | {site title}"
      default: suffix,
      // Articles/pages: "{page name} - {site name} | {site title}"
      template: `%s - ${suffix}`,
    },
    description,
    icons: {
      icon: [{ url: iconUrl }],
      shortcut: [{ url: iconUrl }],
      apple: [{ url: iconUrl }],
    },
    openGraph: {
      title: suffix,
      description,
      siteName,
      images: branding.ogImageUrl ? [branding.ogImageUrl] : undefined,
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: localeParam } = await params;
  if (!hasLocale(routing.locales, localeParam)) {
    notFound();
  }

  const locale = await portalLocaleFromHeaders(localeParam);
  setRequestLocale(locale);
  const appLocale = locale;

  // Parallelize independent shell work; auth is React.cache'd for page reuse.
  const [messages, session] = await Promise.all([getMessages(), auth()]);
  const viewer = contentViewerFromSession(session);
  const [navItems, footerItems, branding, analytics] = await Promise.all([
    listPublicMenuLinks("navigation", appLocale, viewer),
    listPublicMenuLinks("footer", appLocale, viewer),
    getPublicSiteBranding(appLocale),
    getPublicGoogleAnalyticsConfig(),
  ]);

  // Prefer JWT callsign — avoid a Mongo profile round-trip on every nav.
  const user = session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        isAdmin: isAdminRole(session.user),
        callsign: session.user.callsign?.trim() ?? "",
      }
    : null;

  return (
    <NextIntlClientProvider messages={messages}>
      <LocaleAlternatesProvider>
        <div className="flex min-h-[100dvh] flex-col">
          <SiteHeader
            menuItems={navItems}
            user={user}
            branding={{
              siteName: branding.siteName,
              logoUrl: branding.logoUrl || undefined,
            }}
          />
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter
            menuItems={footerItems}
            branding={{
              siteName: branding.siteName,
              copyright: branding.copyright,
            }}
          />
          <PortalAnalytics config={analytics} />
        </div>
      </LocaleAlternatesProvider>
    </NextIntlClientProvider>
  );
}
