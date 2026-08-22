import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { HamQthMapView } from "@/components/portal/ham-qth-map-view";
import { getAccountProfile } from "@/lib/account";
import { getPublicSiteBranding } from "@/lib/cms";
import { isGoogleAuthConfigured } from "@/lib/google-auth";
import { profileAvatarUrl } from "@/lib/gravatar";
import { readMapTilerApiKey } from "@/lib/map/maptiler-style";
import { portalLocaleFromHeaders } from "@/lib/portal-locale-server";
import {
  appendViewerQthStation,
  listAllHamLocations,
  listPublicHamLocations,
} from "@/lib/qth-locations";
import { canManageUsers } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = await portalLocaleFromHeaders(localeParam);
  const t = await getTranslations({ locale, namespace: "ham.qth" });
  return { title: t("title") };
}

export default async function QthMapPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = await portalLocaleFromHeaders(localeParam);
  setRequestLocale(locale);

  const session = await auth();
  const profile = session?.user
    ? await getAccountProfile(session.user.id, session.user.email)
    : null;

  const isAdmin = Boolean(session?.user && canManageUsers(session.user));

  const [branding, publicStations] = await Promise.all([
    getPublicSiteBranding(locale),
    profile
      ? isAdmin
        ? listAllHamLocations()
        : listPublicHamLocations()
      : Promise.resolve([]),
  ]);

  const stations = appendViewerQthStation(
    publicStations,
    profile
      ? {
          callsign: profile.callsign,
          name: profile.name,
          callsignVerified: profile.callsignVerified,
          homeGrid: profile.homeGrid,
          homeLat: profile.homeLat,
          homeLng: profile.homeLng,
        }
      : null,
  );

  return (
    <HamQthMapView
      mapTilerKey={readMapTilerApiKey()}
      stations={stations}
      branding={branding}
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
      loginCallbackUrl="/qth"
    />
  );
}
