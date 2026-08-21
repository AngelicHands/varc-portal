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
import { HamMapFullscreenView } from "@/components/portal/ham-map-fullscreen-view";
import { HamProfileTabs } from "@/components/portal/ham-profile-tabs";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { getAccountProfile } from "@/lib/account";
import { getPublicSiteBranding } from "@/lib/cms";
import { hamPublicPath, parseHamTab, type HamTabId } from "@/lib/ham-reserved";
import { readMapTilerApiKey } from "@/lib/map/maptiler-style";
import { requirePortalSession } from "@/lib/portal-access";
import { listUserQsos } from "@/lib/qso";
import { buildHomeGridMarker } from "@/lib/qso-map";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ setup?: string; tab?: string; view?: string }>;
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

  const { tab: tabParam, view: viewParam } = await searchParams;
  const isMapView = viewParam === "map";
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
    if (isMapView) qs.set("view", "map");
    const query = qs.toString();
    redirect(`${hamPublicPath(callsign)}${query ? `?${query}` : "?tab=profile"}`);
  }

  // No callsign means no public /{callsign} page, so the owner's map lives here.
  if (isMapView) {
    const [branding, qsosForMap] = await Promise.all([
      getPublicSiteBranding(locale),
      listUserQsos(profile.id),
    ]);
    const homeMarker = buildHomeGridMarker(
      profile.homeGrid,
      profile.callsign,
      profile.homeLat,
      profile.homeLng,
    );

    return (
      <>
        <SetLocaleAlternates vi="/account" en="/account" />
        <HamMapFullscreenView
          mapTilerKey={readMapTilerApiKey()}
          callsign={profile.callsign}
          operatorName={profile.name}
          operatorImage={session.user.image ?? null}
          verified={profile.callsignVerified}
          homeGrid={profile.homeGrid}
          homeMarker={homeMarker}
          qsos={qsosForMap}
          showQsoMarkers
          branding={branding}
          canSetHomeLocation={!profile.homeGrid.trim()}
        />
      </>
    );
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
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 font-display text-5xl tracking-wide text-foreground md:text-6xl">
            {displayName}
          </h1>
          {/* Mirrors the public profile's top-right block — without a callsign
              there is no public page, so this is the only place it fits. */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p className="text-right text-sm text-muted">
              {t("securityProfileAccess")}:{" "}
              <span className="font-medium text-foreground">
                {profile.isProfilePublic
                  ? t("securityStatusPublic")
                  : t("securityStatusPrivate")}
              </span>
            </p>
            <a
              href={`${basePath}?view=map`}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 6.5 12 2l9 4.5v11L12 22l-9-4.5v-11Z" />
                <path d="M12 22V11M3 6.5 12 11l9-4.5" />
              </svg>
              {hamT("viewMap")}
            </a>
          </div>
        </div>
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
