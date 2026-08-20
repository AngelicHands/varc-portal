import { z } from "zod";
import { normalizeCallsignQuery } from "@/lib/callsigns-normalize";

/** Basic ham callsign shape (1–2 prefix letters/digits + suffix). */
const CALLSIGN_PATTERN = /^[A-Z0-9/]{3,15}$/;

export function normalizeProfileCallsign(value: string): string {
  return normalizeCallsignQuery(value);
}

export function isValidCallsign(value: string): boolean {
  const normalized = normalizeProfileCallsign(value);
  if (!normalized || normalized.length < 3 || normalized.length > 15) {
    return false;
  }
  return CALLSIGN_PATTERN.test(normalized);
}

export const profileFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  callsign: z
    .string()
    .trim()
    .min(1, "Callsign is required")
    .max(15)
    .transform(normalizeProfileCallsign)
    .refine(isValidCallsign, {
      message: "Enter a valid callsign (e.g. XV1ABC)",
    }),
});

export const QSO_BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
  "23cm",
  "other",
] as const;

export type QsoBand = (typeof QSO_BANDS)[number];

export const QSO_MODES = [
  "SSB",
  "CW",
  "FM",
  "AM",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "JS8",
  "SSTV",
  "DIGITAL",
  "OTHER",
] as const;

export type QsoMode = (typeof QSO_MODES)[number];

/** Decimal frequency in MHz (e.g. 14.074). No range validation. */
export const FREQ_MHZ_PATTERN = /^\d+(\.\d+)?$/;

export function normalizeFreqMhzInput(value: string): string {
  let out = "";
  let hasDot = false;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
    } else if (ch === "." && !hasDot) {
      hasDot = true;
      out += ch;
    }
  }
  return out;
}

export function isValidFreqMhzInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return FREQ_MHZ_PATTERN.test(trimmed);
}

export const qsoFormSchema = z.object({
  workedCallsign: z
    .string()
    .trim()
    .min(1)
    .max(15)
    .transform(normalizeProfileCallsign)
    .refine(isValidCallsign, { message: "Enter a valid contact callsign" }),
  qsoAt: z.string().datetime(),
  band: z.enum(QSO_BANDS),
  freqMhz: z.preprocess(
    (value) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : undefined;
      }
      const trimmed = String(value).trim();
      return trimmed || undefined;
    },
    z
      .string({ message: "Frequency is required" })
      .min(1, "Frequency is required")
      .regex(FREQ_MHZ_PATTERN, "Enter a valid frequency")
      .transform(Number),
  ),
  mode: z.string().trim().min(1).max(32),
  rstSent: z.string().trim().max(16),
  rstRcvd: z.string().trim().max(16),
  qso_sent: z.boolean().default(true),
  qso_confirmed: z.boolean().default(false),
  grid: z
    .string()
    .trim()
    .min(1, "Grid location is required")
    .max(12)
    .transform((value) => value.toUpperCase()),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => value || ""),
});

export type QsoFormValues = z.infer<typeof qsoFormSchema>;

export const qsoInputSchema = qsoFormSchema.omit({ qso_confirmed: true });
export type QsoInputValues = z.infer<typeof qsoInputSchema>;

export const USER_DOCUMENT_KINDS = ["certificate", "license"] as const;
export type UserDocumentKind = (typeof USER_DOCUMENT_KINDS)[number];

export const USER_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const USER_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
