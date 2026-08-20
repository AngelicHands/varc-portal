import {
  adifField,
  baseAdifFields,
  serializeRecord,
  type AdifExportQso,
} from "@/lib/adif/export/shared";

export function serializePortalAdifRecord(
  qso: AdifExportQso,
  stationCallsign: string,
): string {
  const parts = [...baseAdifFields(qso, stationCallsign)];
  if (qso.notes?.trim()) {
    parts.push(adifField("COMMENT", qso.notes.trim()));
  }
  return serializeRecord(parts);
}

export function buildPortalAdifHeader(): string {
  return [
    "ADIF Export from VARC Portal",
    "<ADIF_VER:5>3.1.4",
    "<PROGRAMID:11>VARC Portal",
    "<EOH>",
    "",
  ].join("\r\n");
}
