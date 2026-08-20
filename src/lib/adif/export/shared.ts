import type { QsoSource } from "@/lib/qso-source";

export type AdifExportQso = {
  workedCallsign: string;
  qsoAt: Date;
  band: string;
  freqMhz?: number | null;
  mode: string;
  rstSent: string;
  rstRcvd: string;
  grid?: string;
  notes?: string;
  source?: QsoSource;
  qso_confirmed?: boolean;
  confirmedAt?: Date | null;
};

export function adifField(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `<${name}:${trimmed.length}>${trimmed}`;
}

export function formatAdifDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function formatAdifTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}${min}`;
}

export function bandForAdif(band: string): string {
  if (band === "other") return "";
  return band;
}

export function baseAdifFields(
  qso: AdifExportQso,
  stationCallsign: string,
): string[] {
  const parts = [
    adifField("CALL", qso.workedCallsign),
    adifField("QSO_DATE", formatAdifDate(qso.qsoAt)),
    adifField("TIME_ON", formatAdifTime(qso.qsoAt)),
    adifField("MODE", qso.mode),
    adifField("RST_SENT", qso.rstSent),
    adifField("RST_RCVD", qso.rstRcvd),
    adifField("STATION_CALLSIGN", stationCallsign),
    adifField("APP_VARC_SOURCE", qso.source ?? "portal"),
  ];

  const band = bandForAdif(qso.band);
  if (band) parts.push(adifField("BAND", band));
  if (qso.freqMhz != null && Number.isFinite(qso.freqMhz)) {
    parts.push(adifField("FREQ", String(qso.freqMhz)));
  }
  if (qso.grid?.trim()) {
    parts.push(adifField("GRIDSQUARE", qso.grid.trim().toUpperCase()));
  }

  return parts.filter(Boolean);
}

export function serializeRecord(parts: string[]): string {
  return `${parts.filter(Boolean).join("\r\n")}\r\n<EOR>\r\n`;
}
