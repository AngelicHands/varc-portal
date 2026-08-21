import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  HamOwnerDocumentsTabPanel,
  HamOwnerProfileTabPanel,
  HamOwnerQslTabPanel,
  HamOwnerSecurityTabPanel,
  HamOwnerTabDataProvider,
} from "@/components/portal/ham-owner-tab-panels";
import { HamProfileTabs } from "@/components/portal/ham-profile-tabs";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { getAccountProfile } from "@/lib/account";
import { hamPublicPath, parseHamTab, type HamTabId } from "@/lib/ham-reserved";
import { requirePortalSession } from "@/lib/portal-access";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ setup?: string; tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title") };
}

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const { tab: tabParam } = await searchParams;
  const session = await requirePortalSession(locale);
  const [t, hamT] = await Promise.all([
    getTranslations("account"),
    getTranslations("ham"),
  ]);
  const profile = await getAccountProfile(session.user.id, session.user.email);

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  const callsign = profile.callsign.trim();
  if (callsign) {
    const qs = new URLSearchParams();
    if (
      tabParam === "profile" ||
      tabParam === "documents" ||
      tabParam === "logbook" ||
      tabParam === "qsl" ||
      tabParam === "security"
    ) {
      qs.set("tab", tabParam);
    }
    const query = qs.toString();
    redirect(`${hamPublicPath(callsign)}${query ? `?${query}` : "?tab=profile"}`);
  }

  const visibleTabs: HamTabId[] = [
    "profile",
    "logbook",
    "documents",
    "qsl",
    "security",
  ];
  const activeTab = parseHamTab(tabParam, visibleTabs);
  const basePath = `/${locale}/account`;
  const displayName = profile.name.trim() || profile.email || t("title");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
      <SetLocaleAlternates vi="/account" en="/account" />

      <p className="text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
        {hamT("eyebrow")}
      </p>

      <div className="mt-6">
        <h1 className="font-display text-5xl tracking-wide text-foreground md:text-6xl">
          {displayName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">{t("setupLede")}</p>
      </div>

      <HamOwnerTabDataProvider>
        <HamProfileTabs
          basePath={basePath}
          active={activeTab}
          isOwner
          canViewProfile
          canViewLogbook
          profile={<HamOwnerProfileTabPanel />}
          logbook={
            <div className="rounded-lg border border-dashed border-border px-6 py-16" />
          }
          documents={<HamOwnerDocumentsTabPanel />}
          qsl={<HamOwnerQslTabPanel />}
          security={<HamOwnerSecurityTabPanel />}
        />
      </HamOwnerTabDataProvider>
    </div>
  );
}
