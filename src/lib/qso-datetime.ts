import { PORTAL_TIMEZONE } from "@/lib/datetime-local";

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function utc7Parts(iso: string): Intl.DateTimeFormatPart[] | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
}

/** Display format for tables and search (UTC+7 wall time). */
export function formatQsoDateTime(iso: string): string {
  const parts = utc7Parts(iso);
  if (!parts) return "";
  const day = part(parts, "day");
  const month = part(parts, "month");
  const year = part(parts, "year");
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const second = part(parts, "second");
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

/** Value for `<input type="date">` in UTC+7. */
export function toQsoDateValue(iso: string): string {
  const parts = utc7Parts(iso);
  if (!parts) return "";
  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

/** Value for `<input type="time">` in UTC+7 (includes seconds). */
export function toQsoTimeValue(iso: string): string {
  const parts = utc7Parts(iso);
  if (!parts) return "";
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const second = part(parts, "second");
  if (!hour || !minute || !second) return "";
  return `${hour}:${minute}:${second}`;
}

export function qsoDateTimeNow(): { date: string; time: string } {
  const now = new Date().toISOString();
  return {
    date: toQsoDateValue(now),
    time: toQsoTimeValue(now),
  };
}

/** Parse date + time picker values (UTC+7 wall time) to UTC ISO. */
export function fromQsoDateTimeParts(
  dateValue: string,
  timeValue: string,
): string | null {
  const date = dateValue.trim();
  const time = timeValue.trim();
  if (!date || !time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(normalizedTime)) return null;

  const parsed = new Date(`${date}T${normalizedTime}+07:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
