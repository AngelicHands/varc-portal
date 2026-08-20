export type QsoTimeZoneMode = "utc" | "local";

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function formatParts(
  iso: string,
  timeZone?: string,
): Intl.DateTimeFormatPart[] | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
}

function partsToDateTime(
  parts: Intl.DateTimeFormatPart[] | null,
): { date: string; time: string } | null {
  if (!parts) return null;
  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const second = part(parts, "second");
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
}

/** Display format for tables and search. Always UTC. */
export function formatQsoDateTime(iso: string): string {
  const values = partsToDateTime(formatParts(iso, "UTC"));
  if (!values) return "";
  const [year, month, day] = values.date.split("-");
  return `${day}/${month}/${year} ${values.time} UTC`;
}

export function toQsoDateValue(
  iso: string,
  zone: QsoTimeZoneMode = "utc",
): string {
  const values = partsToDateTime(
    formatParts(iso, zone === "utc" ? "UTC" : undefined),
  );
  return values?.date ?? "";
}

export function toQsoTimeValue(
  iso: string,
  zone: QsoTimeZoneMode = "utc",
): string {
  const values = partsToDateTime(
    formatParts(iso, zone === "utc" ? "UTC" : undefined),
  );
  return values?.time ?? "";
}

export function qsoDateTimeNow(
  zone: QsoTimeZoneMode = "utc",
): { date: string; time: string } {
  const now = new Date().toISOString();
  return {
    date: toQsoDateValue(now, zone),
    time: toQsoTimeValue(now, zone),
  };
}

/**
 * Parse date + time picker values in UTC or the browser local zone
 * and return a UTC ISO timestamp.
 */
export function fromQsoDateTimeParts(
  dateValue: string,
  timeValue: string,
  zone: QsoTimeZoneMode = "utc",
): string | null {
  const date = dateValue.trim();
  const time = timeValue.trim();
  if (!date || !time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(normalizedTime)) return null;

  const parsed =
    zone === "utc"
      ? new Date(`${date}T${normalizedTime}Z`)
      : new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Convert the same instant between UTC and local picker values. */
export function convertQsoDateTimeParts(
  dateValue: string,
  timeValue: string,
  fromZone: QsoTimeZoneMode,
  toZone: QsoTimeZoneMode,
): { date: string; time: string } | null {
  if (fromZone === toZone) {
    return { date: dateValue, time: timeValue };
  }
  const iso = fromQsoDateTimeParts(dateValue, timeValue, fromZone);
  if (!iso) return null;
  const date = toQsoDateValue(iso, toZone);
  const time = toQsoTimeValue(iso, toZone);
  if (!date || !time) return null;
  return { date, time };
}
