import { normalizeQsoSource, type QsoSource } from "@/lib/qso-source";
import {
  buildEqslAdifHeader,
  serializeEqslAdifRecord,
} from "@/lib/adif/export/eqsl";
import {
  buildPortalAdifHeader,
  serializePortalAdifRecord,
} from "@/lib/adif/export/portal";
import {
  buildQrzAdifHeader,
  serializeQrzAdifRecord,
} from "@/lib/adif/export/qrz";
import type { AdifExportQso } from "@/lib/adif/export/shared";

export type { AdifExportQso } from "@/lib/adif/export/shared";

function serializeBySource(
  qso: AdifExportQso,
  stationCallsign: string,
): string {
  const source = normalizeQsoSource(qso.source, "portal");
  if (source === "qrz") {
    return serializeQrzAdifRecord(qso, stationCallsign);
  }
  if (source === "eqsl") {
    return serializeEqslAdifRecord(qso, stationCallsign);
  }
  return serializePortalAdifRecord(qso, stationCallsign);
}

function headerForSources(sources: Set<QsoSource>): string {
  if (sources.size === 1) {
    const only = [...sources][0]!;
    if (only === "qrz") return buildQrzAdifHeader();
    if (only === "eqsl") return buildEqslAdifHeader();
  }
  return buildPortalAdifHeader();
}

export function serializeQsoToAdifRecord(
  qso: AdifExportQso,
  stationCallsign: string,
): string {
  return serializeBySource(qso, stationCallsign);
}

export function buildAdifExport(
  qsos: AdifExportQso[],
  stationCallsign: string,
): string {
  const sources = new Set(
    qsos.map((qso) => normalizeQsoSource(qso.source, "portal")),
  );
  const header = headerForSources(sources);
  const body = qsos
    .map((qso) => serializeBySource(qso, stationCallsign))
    .join("");
  return `${header}${body}`;
}

export function adifFilename(callsign: string, now = new Date()): string {
  const safe = callsign.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "LOG";
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${safe}_${y}${m}${d}.adi`;
}
