import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { routing } from "@/i18n/routing";
import { portalLocaleFromHeaders } from "@/lib/portal-locale-server";
import { getPublicSiteBranding, listPublicMenuLinks } from "@/lib/cms";
import { getAccountProfile } from "@/lib/account";
import { isAdminRole } from "@/lib/roles";
import { contentViewerFromSession } from "@/lib/content-access";
import { SiteFooter } from "@/components/portal/site-footer";
import { SiteHeader } from "@/components/portal/site-header";
import { LocaleAlternatesProvider } from "@/components/portal/locale-alternates";

export const dynamic = "force-dynamic";

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

  return {
    title: {
      // Home: "{site name} | {site title}"
      default: suffix,
      // Articles/pages: "{page name} - {site name} | {site title}"
      template: `%s - ${suffix}`,
    },
    description,
    icons: {
      icon: [{ url: "/api/favicon" }],
      shortcut: [{ url: "/api/favicon" }],
      apple: [{ url: "/api/favicon" }],
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
  const messages = await getMessages();
  const appLocale = locale;
  const session = await auth();
  const viewer = contentViewerFromSession(session);
  const [navItems, footerItems, branding] = await Promise.all([
    listPublicMenuLinks("navigation", appLocale, viewer),
    listPublicMenuLinks("footer", appLocale, viewer),
    getPublicSiteBranding(appLocale),
  ]);

  const profile = session?.user
    ? await getAccountProfile(session.user.id, session.user.email)
    : null;
  const user = session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        isAdmin: isAdminRole(session.user),
        callsign: profile?.callsign?.trim() ?? "",
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
          <main className="flex-1">{children}</main>
          <SiteFooter
            menuItems={footerItems}
            branding={{
              siteName: branding.siteName,
              copyright: branding.copyright,
            }}
          />
        </div>
      </LocaleAlternatesProvider>
    </NextIntlClientProvider>
  );
}
