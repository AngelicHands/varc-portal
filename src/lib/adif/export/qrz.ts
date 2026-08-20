import {
  adifField,
  baseAdifFields,
  formatAdifDate,
  serializeRecord,
  type AdifExportQso,
} from "@/lib/adif/export/shared";

export function serializeQrzAdifRecord(
  qso: AdifExportQso,
  stationCallsign: string,
): string {
  const parts = [...baseAdifFields(qso, stationCallsign)];
  if (qso.notes?.trim()) {
    parts.push(adifField("COMMENT", qso.notes.trim()));
  }
  if (qso.qso_confirmed) {
    parts.push(adifField("APP_QRZLOG_STATUS", "C"));
    if (qso.confirmedAt) {
      parts.push(adifField("APP_QRZLOG_QSLDATE", formatAdifDate(qso.confirmedAt)));
    }
  }
  return serializeRecord(parts);
}

export function buildQrzAdifHeader(): string {
  return [
    "QRZLogbook download from VARC Portal",
    "<ADIF_VER:5>3.1.1",
    "<PROGRAMID:10>QRZLogbook",
    "<PROGRAMVERSION:3>2.0",
    "<EOH>",
    "",
  ].join("\r\n");
}
