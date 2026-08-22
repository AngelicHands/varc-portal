import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { HamMapFullscreenView } from "@/components/portal/ham-map-fullscreen-view";
import {
  HamOwnerDocumentsTabPanel,
  HamOwnerPrivacyTabPanel,
  HamOwnerProfileTabPanel,
  HamOwnerQslTabPanel,
  HamOwnerSecurityTabPanel,
  HamOwnerTabDataProvider,
} from "@/components/portal/ham-owner-tab-panels";
import { HamProfileTabs } from "@/components/portal/ham-profile-tabs";
import { PublicHamProfileTabPanel } from "@/components/portal/public-ham-profile-tab-panel";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";
import { QsoLogbook } from "@/components/portal/qso-logbook";
import { getAccountProfile } from "@/lib/account";
import { findPublicHamByCallsign, hamPublicPath, hamPublicUrl } from "@/lib/ham-profile";
import { parseHamPathParam, parseHamTab, type HamTabId } from "@/lib/ham-reserved";
import { getPublicSiteBranding } from "@/lib/cms";
import { isGoogleAuthConfigured } from "@/lib/google-auth";
import { profileAvatarUrl } from "@/lib/gravatar";
import {
  canAccessHamMapPage,
  canViewHomeMapMarker,
  canViewQsoMapMarkers,
} from "@/lib/ham-map-access";
import { readMapTilerApiKey } from "@/lib/map/maptiler-style";
import { buildHomeGridMarker } from "@/lib/qso-map";
import { listUserQsos } from "@/lib/qso";
import { callsignHref, hamHref } from "@/lib/locale-hrefs";
import { formatBirthdayDmy } from "@/lib/validations/qso";
import {
  canViewHamBasicProfile,
  canViewHamDocuments,
  canViewHamLocation,
  canViewHamLogbook,
  canViewHamProfileTab,
} from "@/lib/ham-privacy";
import { listUserDocuments } from "@/lib/user-documents";
import { canManageUsers } from "@/lib/roles";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string; callsign: string }>;
  searchParams: Promise<{
    tab?: string;
    view?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam, callsign: raw } = await params;
  const locale = localeParam as AppLocale;
  const sign = parseHamPathParam(raw);
  if (!sign) return { title: "Not found" };
  const ham = await findPublicHamByCallsign(sign);
  if (!ham) return { title: "Not found" };

  const t = await getTranslations({ locale, namespace: "ham" });
  const branding = await getPublicSiteBranding(locale);
  const description = ham.isProfilePublic
    ? t("description", {
        sign: ham.callsign,
        name: ham.name,
      })
    : t("privateDescription", { sign: ham.callsign });
  const canonical = hamPublicUrl(ham.callsign);

  return {
    title: ham.callsign,
    description,
    alternates: {
      canonical,
      languages: {
        vi: canonical,
        en: canonical,
        "x-default": canonical,
      },
    },
    openGraph: {
      title: `${ham.callsign} - ${branding.siteName}`,
      description,
      url: canonical,
    },
  };
}

export default async function HamProfilePage({ params, searchParams }: Props) {
  const { locale: localeParam, callsign: raw } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const {
    tab: tabParam,
    view: viewParam,
    page: pageParam,
    pageSize: pageSizeParam,
    q: searchParam,
    sort: sortParam,
    dir: dirParam,
  } = await searchParams;
  const isMapView = viewParam === "map";
  const sign = parseHamPathParam(raw);
  if (!sign) notFound();
  if (raw !== sign) {
    const qs = new URLSearchParams();
    if (
      tabParam === "profile" ||
      tabParam === "documents" ||
      tabParam === "logbook" ||
      tabParam === "qsl" ||
      tabParam === "privacy" ||
      tabParam === "security"
    ) {
      qs.set("tab", tabParam);
    }
    if (isMapView) qs.set("view", "map");
    if (pageParam) qs.set("page", pageParam);
    if (pageSizeParam) qs.set("pageSize", pageSizeParam);
    if (searchParam) qs.set("q", searchParam);
    if (sortParam) qs.set("sort", sortParam);
    if (dirParam) qs.set("dir", dirParam);
    const query = qs.toString();
    redirect(`${hamPublicPath(sign)}${query ? `?${query}` : ""}`);
  }

  const ham = await findPublicHamByCallsign(sign);
  if (!ham) notFound();

  const [t, session, accountT] = await Promise.all([
    getTranslations("ham"),
    auth(),
    getTranslations("account"),
  ]);
  const viewerProfile = session?.user
    ? await getAccountProfile(session.user.id, session.user.email)
    : null;
  const canEdit = session?.user?.id === ham.id;
  const canAdminManage = Boolean(
    session?.user?.id && !canEdit && canManageUsers(session.user),
  );
  const isBlockedProfile = !canEdit && !canAdminManage && !ham.isProfilePublic;
  if (isBlockedProfile) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4 py-14 md:px-6">
        <SetLocaleAlternates
          vi={hamHref(ham.callsign)}
          en={hamHref(ham.callsign)}
        />
        <div className="w-full px-6 py-12 text-center">
          <p className="text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 font-display text-4xl text-foreground md:text-5xl">
            {ham.callsign}
          </h1>
          <p className="mt-4 text-lg text-foreground">{t("privateProfileTitle")}</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">
            {t("privateProfileMessage")}
          </p>
        </div>
      </div>
    );
  }
  const viewerAccess = { canEdit, canAdminManage };
  const canViewBasicProfile = canViewHamBasicProfile(ham, viewerAccess);
  const canViewLocation = canViewHamLocation(ham, viewerAccess);
  const canViewDocuments = canViewHamDocuments(ham, viewerAccess);
  const canViewProfileTab = canViewHamProfileTab(ham, viewerAccess);

  const canViewLogbook = canViewHamLogbook(ham, viewerAccess);
  const verified = ham.callsignVerified;

  const mapAccess =
    canAccessHamMapPage(isBlockedProfile) &&
    (canViewLocation || canViewLogbook);

  if (isMapView) {
    if (!mapAccess) {
      redirect(hamPublicPath(ham.callsign));
    }

    const branding = await getPublicSiteBranding(locale);

    const showQsoMarkers = canViewQsoMapMarkers(canViewLogbook);
    const showHomeMarker = canViewHomeMapMarker(canViewLocation, ham.homeGrid);
    const qsosForMap = showQsoMarkers ? await listUserQsos(ham.id) : [];
    const homeMarker = showHomeMarker
      ? buildHomeGridMarker(ham.homeGrid, ham.callsign, ham.homeLat, ham.homeLng)
      : null;

    return (
      <>
        <SetLocaleAlternates
          vi={hamHref(ham.callsign)}
          en={hamHref(ham.callsign)}
        />
        <HamMapFullscreenView
          mapTilerKey={readMapTilerApiKey()}
          callsign={ham.callsign}
          operatorName={canViewBasicProfile ? ham.name : ""}
          operatorImage={canViewBasicProfile ? ham.image : null}
          verified={verified}
          homeGrid={canViewLocation ? ham.homeGrid : ""}
          homeMarker={homeMarker}
          qsos={qsosForMap}
          showQsoMarkers={showQsoMarkers}
          branding={branding}
          canSetHomeLocation={canEdit && !ham.homeGrid.trim()}
          canAddQso={canEdit}
          initialViewed={{
            callsign: ham.callsign,
            homeMarker,
            qsos: qsosForMap,
            isOwner: canEdit,
            showQsoMarkers,
          }}
          viewer={
            viewerProfile
              ? {
                  name: viewerProfile.name,
                  callsign: viewerProfile.callsign,
                  homeGrid: viewerProfile.homeGrid,
                  image: profileAvatarUrl(session?.user.image, viewerProfile.email),
                }
              : null
          }
          hasGoogleLogin={isGoogleAuthConfigured()}
          loginCallbackUrl={`${hamPublicPath(ham.callsign)}?view=map`}
        />
      </>
    );
  }

  const visibleTabs: HamTabId[] = canEdit
    ? ["profile", "logbook", "documents", "qsl", "privacy", "security"]
    : [
        ...(canViewProfileTab ? (["profile"] as HamTabId[]) : []),
        ...(canViewLogbook ? (["logbook"] as HamTabId[]) : []),
        ...(canViewDocuments ? (["documents"] as HamTabId[]) : []),
      ];

  const publicDocuments =
    canViewDocuments && !canEdit ? await listUserDocuments(ham.id) : [];

  const canLogWithOperator = canViewLogbook && Boolean(viewerProfile?.callsign?.trim());
  const activeTab = parseHamTab(tabParam, visibleTabs);
  const birthdayLabel = canViewBasicProfile
    ? formatBirthdayDmy(ham.birthday) || null
    : null;

  const logbookT = await getTranslations("logbook");

  const logbookPanel = canViewLogbook ? (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center gap-2 py-16 text-sm text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-muted border-t-accent"
            aria-hidden
          />
          {logbookT("loading")}
        </div>
      }
    >
      <QsoLogbook
        key={ham.id}
        logbookUserId={ham.id}
        stationCallsign={ham.callsign}
        canEdit={canEdit}
        canLogWithOperator={canLogWithOperator}
        canAdminManage={canAdminManage}
      />
    </Suspense>
  ) : (
    <p className="text-sm text-muted">{accountT("securityQsoPrivateNotice")}</p>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
      <SetLocaleAlternates
        vi={hamHref(ham.callsign)}
        en={hamHref(ham.callsign)}
      />

      <p className="text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
        {t("eyebrow")}
      </p>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
        {canViewBasicProfile && ham.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ham.image}
            alt=""
            className="h-24 w-24 shrink-0 rounded-full border border-border object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="font-display text-5xl tracking-wide text-foreground md:text-6xl">
                {ham.callsign}
              </h1>
              {canViewBasicProfile && verified ? (
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700"
                  aria-label="Verified callsign"
                  title="Verified callsign"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-4 w-4"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.5 8.5 6.5 11.5 12.5 5.5" />
                  </svg>
                </span>
              ) : null}
            </div>
            {canEdit || canAdminManage || mapAccess ? (
              <div className="flex shrink-0 flex-col items-end gap-2">
                {canEdit || canAdminManage ? (
                  <p className="text-right text-sm text-muted">
                    {accountT("securityProfileAccess")}:{" "}
                    <span className="font-medium text-foreground">
                      {ham.isProfilePublic
                        ? accountT("securityStatusPublic")
                        : accountT("securityStatusPrivate")}
                    </span>
                  </p>
                ) : null}
                {mapAccess ? (
                  <a
                    href={`${hamPublicPath(ham.callsign)}?view=map`}
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
                    {t("viewMap")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {canViewBasicProfile && !verified ? (
            <p className="mt-2 text-xs text-amber-800">{t("unverified")}</p>
          ) : null}
          {canViewBasicProfile ? (
            <p className="mt-2 text-lg text-foreground">{ham.name}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">{accountT("securityProfilePrivateNotice")}</p>
          )}
          {birthdayLabel ? (
            <p className="mt-1 text-sm text-muted">{birthdayLabel}</p>
          ) : null}
        </div>
      </div>

      {canViewBasicProfile && ham.archiveExists ? (
        <p className="mt-6 text-sm text-muted">
          <Link
            href={callsignHref(ham.callsign)}
            className="text-accent hover:underline"
          >
            {t("licenseHistory")}
          </Link>
        </p>
      ) : null}

      {canEdit ? (
        <HamOwnerTabDataProvider>
          <HamProfileTabs
            basePath={`/${ham.callsign}`}
            callsign={ham.callsign}
            active={activeTab}
            isOwner={canEdit}
            canViewProfile={canViewBasicProfile}
            canViewLogbook={canViewLogbook}
            profile={<HamOwnerProfileTabPanel />}
            logbook={logbookPanel}
            documents={<HamOwnerDocumentsTabPanel />}
            qsl={<HamOwnerQslTabPanel />}
            privacy={<HamOwnerPrivacyTabPanel />}
            security={<HamOwnerSecurityTabPanel />}
          />
        </HamOwnerTabDataProvider>
      ) : (
        <HamProfileTabs
          basePath={`/${ham.callsign}`}
          callsign={ham.callsign}
          active={activeTab}
          isOwner={canEdit}
          canViewProfile={canViewBasicProfile}
          canViewLogbook={canViewLogbook}
          profile={
            canViewProfileTab ? (
              <PublicHamProfileTabPanel
                ham={ham}
                locale={locale}
                access={viewerAccess}
              />
            ) : null
          }
          logbook={logbookPanel}
          documents={
            canViewDocuments ? (
              <UserDocumentsPanel
                initialDocuments={publicDocuments}
                uploadEndpoint=""
                readOnly
                canDelete={false}
                variant="panels"
                labels={{
                  certificate: accountT("certificate"),
                  license: accountT("license"),
                  noDocuments: accountT("noDocuments"),
                }}
              />
            ) : null
          }
          qsl={null}
          privacy={null}
          security={null}
        />
      )}
    </div>
  );
}
