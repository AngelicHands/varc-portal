import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { HamMapFullscreenView } from "@/components/portal/ham-map-fullscreen-view";
import { getAccountProfile } from "@/lib/account";
import { getPublicSiteBranding } from "@/lib/cms";
import { isGoogleAuthConfigured } from "@/lib/google-auth";
import { profileAvatarUrl } from "@/lib/gravatar";
import { readMapTilerApiKey } from "@/lib/map/maptiler-style";
import { portalLocaleFromHeaders } from "@/lib/portal-locale-server";
import { listUserQsos } from "@/lib/qso";
import { buildHomeGridMarker } from "@/lib/qso-map";
import { lookupPublicQsoMap } from "@/lib/qso-map-lookup";
import { normalizeProfileCallsign } from "@/lib/validations/qso";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callsign?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = await portalLocaleFromHeaders(localeParam);
  const t = await getTranslations({ locale, namespace: "ham.map" });
  return { title: t("title") };
}

export default async function QsoMapPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = await portalLocaleFromHeaders(localeParam);
  setRequestLocale(locale);

  const { callsign: initialLookupCallsignRaw } = await searchParams;
  const initialLookupCallsign = initialLookupCallsignRaw?.trim() ?? "";

  const session = await auth();
  const profile = session?.user
    ? await getAccountProfile(session.user.id, session.user.email)
    : null;

  const [branding, qsos] = await Promise.all([
    getPublicSiteBranding(locale),
    profile ? listUserQsos(profile.id) : Promise.resolve([]),
  ]);

  const homeMarker = profile
    ? buildHomeGridMarker(
        profile.homeGrid,
        profile.callsign,
        profile.homeLat,
        profile.homeLng,
      )
    : null;

  const ownerCallsign = normalizeProfileCallsign(profile?.callsign ?? "");
  const requestedCallsign = normalizeProfileCallsign(initialLookupCallsign);
  const shouldPrefetchLookup =
    Boolean(requestedCallsign) &&
    (!ownerCallsign || requestedCallsign !== ownerCallsign);
  const lookupResult = shouldPrefetchLookup
    ? await lookupPublicQsoMap(initialLookupCallsign)
    : null;
  const initialViewed =
    lookupResult?.ok === true
      ? {
          callsign: lookupResult.callsign,
          homeMarker: lookupResult.homeMarker,
          qsos: lookupResult.qsos,
          isOwner: lookupResult.isOwner,
        }
      : undefined;
  const initialLookupError =
    lookupResult?.ok === false ? lookupResult.error : undefined;

  return (
    <HamMapFullscreenView
      mapTilerKey={readMapTilerApiKey()}
      callsign={profile?.callsign ?? ""}
      operatorName={profile?.name ?? ""}
      operatorImage={null}
      verified={profile?.callsignVerified ?? false}
      homeGrid={profile?.homeGrid ?? ""}
      homeMarker={homeMarker}
      qsos={qsos}
      showQsoMarkers={Boolean(profile)}
      branding={branding}
      canSetHomeLocation={Boolean(profile && !profile.homeGrid.trim())}
      needsCallsign={Boolean(profile && !profile.callsign.trim())}
      canAddQso={Boolean(profile?.callsign.trim())}
      viewer={
        profile
          ? {
              name: profile.name,
              callsign: profile.callsign,
              homeGrid: profile.homeGrid,
              image: profileAvatarUrl(session?.user.image, profile.email),
            }
          : null
      }
      hasGoogleLogin={isGoogleAuthConfigured()}
      loginCallbackUrl="/qso"
      initialLookupCallsign={initialLookupCallsign || undefined}
      initialViewed={initialViewed}
      initialLookupError={initialLookupError}
    />
  );
}
