"use server";

import { auth } from "@/auth";
import type { QsoListItemDto } from "@/lib/account-types";
import { getAccountProfile } from "@/lib/account";
import { findPublicHamByCallsign } from "@/lib/ham-profile";
import {
  canViewHamBasicProfile,
  canViewHamLocation,
  canViewHamLogbook,
} from "@/lib/ham-privacy";
import { listUserQsos } from "@/lib/qso";
import { buildHomeGridMarker, type HomeGridMarker } from "@/lib/qso-map";
import { isValidCallsign, normalizeProfileCallsign } from "@/lib/validations/qso";

export type PublicQsoMapLookup =
  | {
      ok: true;
      callsign: string;
      name: string;
      image: string | null;
      verified: boolean;
      homeGrid: string;
      homeMarker: HomeGridMarker | null;
      qsos: QsoListItemDto[];
      isOwner: boolean;
    }
  | { ok: false; error: "invalid" | "notFound" | "private" };

export async function lookupPublicQsoMapAction(
  raw: string,
): Promise<PublicQsoMapLookup> {
  const callsign = normalizeProfileCallsign(raw);
  if (!isValidCallsign(callsign)) {
    return { ok: false, error: "invalid" };
  }

  const ham = await findPublicHamByCallsign(callsign);
  if (!ham) {
    return { ok: false, error: "notFound" };
  }

  const session = await auth();
  const viewer = session?.user
    ? await getAccountProfile(session.user.id, session.user.email)
    : null;
  const viewerCallsign = normalizeProfileCallsign(viewer?.callsign ?? "");
  const isOwner =
    Boolean(viewer && ham.id === viewer.id) ||
    Boolean(viewerCallsign && viewerCallsign === ham.callsign);

  const viewerAccess = { canEdit: isOwner, canAdminManage: false };
  const canViewLogbook = canViewHamLogbook(ham, viewerAccess);
  const canViewBasicProfile = canViewHamBasicProfile(ham, viewerAccess);
  const canViewLocation = canViewHamLocation(ham, viewerAccess);

  if (!canViewLogbook && !canViewLocation && !isOwner) {
    return { ok: false, error: "private" };
  }

  const qsos = canViewLogbook ? await listUserQsos(ham.id) : [];
  return {
    ok: true,
    callsign: ham.callsign,
    name: canViewBasicProfile ? ham.name : "",
    image: canViewBasicProfile ? ham.image : null,
    verified: canViewBasicProfile && ham.callsignVerified,
    homeGrid: canViewLocation ? ham.homeGrid : "",
    homeMarker: canViewLocation
      ? buildHomeGridMarker(
          ham.homeGrid,
          ham.callsign,
          ham.homeLat,
          ham.homeLng,
        )
      : null,
    qsos,
    isOwner,
  };
}
