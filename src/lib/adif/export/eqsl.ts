import {
  adifField,
  formatAdifDate,
  formatAdifTime,
  serializeRecord,
  type AdifExportQso,
} from "@/lib/adif/export/shared";

export function serializeEqslAdifRecord(
  qso: AdifExportQso,
  stationCallsign: string,
): string {
  const band = qso.band === "other" ? "" : qso.band.toUpperCase();
  const compact = [
    adifField("CALL", qso.workedCallsign),
    adifField("QSO_DATE", formatAdifDate(qso.qsoAt)),
    adifField("TIME_ON", formatAdifTime(qso.qsoAt)),
    ...(band ? [adifField("BAND", band)] : []),
    adifField("MODE", qso.mode),
    adifField("RST_SENT", qso.rstSent),
    adifField("QSL_SENT", "Y"),
    adifField("QSL_SENT_VIA", "E"),
    adifField("APP_VARC_SOURCE", qso.source ?? "eqsl"),
    adifField("STATION_CALLSIGN", stationCallsign),
  ];

  if (qso.notes?.trim()) {
    compact.push(adifField("QSLMSG", qso.notes.trim()));
  }

  return serializeRecord(compact);
}

export function buildEqslAdifHeader(): string {
  return [
    "ADIF 2 Export from VARC Portal",
    "<PROGRAMID:20>eQSL.cc DownloadADIF",
    "<ADIF_Ver:1>2",
    "<EOH>",
    "",
  ].join("\r\n");
}
