"use server";

import { lookupPublicQsoMap } from "@/lib/qso-map-lookup";

export async function lookupPublicQsoMapAction(raw: string) {
  return lookupPublicQsoMap(raw);
}
