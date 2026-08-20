export type AdifQsoRecord = {
  workedCallsign: string;
  qsoAt: Date;
  band: string;
  freqMhz?: number | null;
  mode: string;
  rstSent: string;
  rstRcvd: string;
  grid?: string;
  notes?: string;
};

function adifField(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `<${name}:${trimmed.length}>${trimmed}`;
}

function formatAdifDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatAdifTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}${min}`;
}

function bandForAdif(band: string): string {
  if (band === "other") return "";
  return band;
}

export function serializeQsoToAdifRecord(
  qso: AdifQsoRecord,
  stationCallsign: string,
): string {
  const parts = [
    adifField("CALL", qso.workedCallsign),
    adifField("QSO_DATE", formatAdifDate(qso.qsoAt)),
    adifField("TIME_ON", formatAdifTime(qso.qsoAt)),
    adifField("MODE", qso.mode),
    adifField("RST_SENT", qso.rstSent),
    adifField("RST_RCVD", qso.rstRcvd),
    adifField("STATION_CALLSIGN", stationCallsign),
  ];

  const band = bandForAdif(qso.band);
  if (band) parts.push(adifField("BAND", band));
  if (qso.freqMhz != null && Number.isFinite(qso.freqMhz)) {
    parts.push(adifField("FREQ", String(qso.freqMhz)));
  }
  if (qso.grid?.trim()) {
    parts.push(adifField("GRIDSQUARE", qso.grid.trim().toUpperCase()));
  }
  if (qso.notes?.trim()) {
    parts.push(adifField("COMMENT", qso.notes.trim()));
  }

  return `${parts.filter(Boolean).join("\r\n")}\r\n<EOR>\r\n`;
}

export function buildAdifExport(
  qsos: AdifQsoRecord[],
  stationCallsign: string,
): string {
  const header = [
    "ADIF Export from VARC Portal",
    "<ADIF_VER:5>3.1.4",
    `<PROGRAMID:11>VARC Portal`,
    "<EOH>",
    "",
  ].join("\r\n");

  const body = qsos
    .map((qso) => serializeQsoToAdifRecord(qso, stationCallsign))
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
