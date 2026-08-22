import {
  HAM_PUBLIC_CACHE_TTL_SEC,
  QsoCacheKeys,
  qsoCacheAside,
} from "@/lib/cache/qso-cache";
import { connectDb } from "@/lib/db";
import { buildHomeGridMarker, type HomeGridMarker } from "@/lib/qso-map";
import { User } from "@/models/User";

export type PublicHamLocationStation = {
  callsign: string;
  name: string;
  verified: boolean;
  homeMarker: HomeGridMarker;
};

const QTH_LOCATIONS_TAG = "qth:public-locations";

export async function listPublicHamLocations(): Promise<
  PublicHamLocationStation[]
> {
  return qsoCacheAside(
    QsoCacheKeys.publicQthLocations(),
    [QTH_LOCATIONS_TAG],
    async () => {
      await connectDb();
      const users = await User.find({
        callsign: { $gt: "" },
        isProfilePublic: { $ne: false },
        isLocationPublic: true,
        homeGrid: { $gt: "" },
      })
        .select("callsign name callsignVerified homeGrid homeLat homeLng")
        .sort({ callsign: 1 })
        .lean<
          Array<{
            callsign: string;
            name: string;
            callsignVerified?: boolean;
            homeGrid: string;
            homeLat?: number | null;
            homeLng?: number | null;
          }>
        >();

      const stations: PublicHamLocationStation[] = [];
      for (const user of users) {
        const homeMarker = buildHomeGridMarker(
          user.homeGrid,
          user.callsign,
          user.homeLat ?? null,
          user.homeLng ?? null,
        );
        if (!homeMarker) continue;
        stations.push({
          callsign: user.callsign.trim().toUpperCase(),
          name: user.name.trim() || user.callsign.trim().toUpperCase(),
          verified: Boolean(user.callsignVerified),
          homeMarker,
        });
      }
      return stations;
    },
    HAM_PUBLIC_CACHE_TTL_SEC,
  );
}

type ViewerQthProfile = {
  callsign: string;
  name: string;
  callsignVerified: boolean;
  homeGrid: string;
  homeLat: number | null;
  homeLng: number | null;
};

/** Adds the signed-in viewer when they are not already in the public list. */
export function appendViewerQthStation(
  stations: PublicHamLocationStation[],
  viewer: ViewerQthProfile | null,
): PublicHamLocationStation[] {
  if (!viewer) return stations;

  const callsign = viewer.callsign.trim().toUpperCase();
  if (!callsign || !viewer.homeGrid.trim()) return stations;
  if (stations.some((station) => station.callsign === callsign)) {
    return stations;
  }

  const homeMarker = buildHomeGridMarker(
    viewer.homeGrid,
    callsign,
    viewer.homeLat,
    viewer.homeLng,
  );
  if (!homeMarker) return stations;

  return [
    ...stations,
    {
      callsign,
      name: viewer.name.trim() || callsign,
      verified: viewer.callsignVerified,
      homeMarker,
    },
  ].sort((a, b) => a.callsign.localeCompare(b.callsign));
}
