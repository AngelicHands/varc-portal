import { z } from "zod";
import { isProfileCountryCode } from "@/lib/countries";
import { normalizeCallsignQuery } from "@/lib/callsigns-normalize";
import { isReservedHamPath } from "@/lib/ham-reserved";
import { isValidMaidenheadGrid, normalizeGrid } from "@/lib/maidenhead";

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
  if (isReservedHamPath(normalized)) return false;
  return CALLSIGN_PATTERN.test(normalized);
}

const reservedCallsignMessage = "This callsign is reserved by the site";

/**
 * Optional / clearable callsign. Blank clears it, but input that is non-blank
 * and only *normalizes* to blank (e.g. "!!") is rejected — validate before the
 * transform so typos can never silently wipe an existing callsign.
 */
export const adminCallsignSchema = z
  .string()
  .trim()
  .max(15)
  .refine(
    (value) => value === "" || !isReservedHamPath(normalizeProfileCallsign(value)),
    { message: reservedCallsignMessage },
  )
  .refine((value) => value === "" || isValidCallsign(value), {
    message: "Enter a valid callsign (e.g. XV1ABC)",
  })
  .transform((value) => normalizeProfileCallsign(value));

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export const PROFILE_GENDERS = ["male", "female", "other"] as const;

export function maxBirthdayYear(): number {
  return new Date().getFullYear() - 10;
}

export function maxBirthdayIso(): string {
  return `${maxBirthdayYear()}-12-31`;
}

export function formatBirthdayDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = DATE_ONLY.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function splitBirthdayIso(iso: string | null | undefined): {
  day: string;
  month: string;
  year: string;
} {
  if (!iso) return { day: "", month: "", year: "" };
  const match = DATE_ONLY.exec(iso);
  if (!match) return { day: "", month: "", year: "" };
  const [, year, month, day] = match;
  return {
    day: String(Number(day)),
    month: String(Number(month)),
    year,
  };
}

export function daysInBirthdayMonth(month: number, year: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 31;
  if (!Number.isInteger(year) || year < 1900) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Empty parts → "". All parts → ISO or null if invalid. Partial parts → null. */
export function composeBirthdayIso(
  day: string,
  month: string,
  year: string,
): string | null {
  const dayTrim = day.trim();
  const monthTrim = month.trim();
  const yearTrim = year.trim();
  if (!dayTrim && !monthTrim && !yearTrim) return "";
  if (!dayTrim || !monthTrim || !yearTrim) return null;
  return parseBirthdayInput(`${dayTrim}/${monthTrim}/${yearTrim}`);
}

/** Parse dd/mm/yyyy (or yyyy-mm-dd) to ISO yyyy-mm-dd. Empty → "". Invalid → null. */
export function parseBirthdayInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let year: number;
  let month: number;
  let day: number;

  const dmy = DATE_DMY.exec(trimmed);
  const iso = DATE_ONLY.exec(trimmed);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (year < 1900 || year > maxBirthdayYear()) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Every profile field is clearable: an empty string means "remove this value".
export const profileFormSchema = z.object({
  name: z.string().trim().max(120),
  callsign: adminCallsignSchema,
  birthday: z
    .string()
    .trim()
    .transform((value) => parseBirthdayInput(value))
    .refine((value): value is string => value !== null, {
      message: "Enter a valid birthday",
    }),
  gender: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => value === "" || PROFILE_GENDERS.includes(value as (typeof PROFILE_GENDERS)[number]),
      { message: "Select a gender" },
    ),
  homeGrid: z
    .string()
    .trim()
    .max(12)
    .transform((value) => normalizeGrid(value))
    .refine((value) => value === "" || isValidMaidenheadGrid(value), {
      message: "Enter a valid Maidenhead grid (e.g. OK30)",
    }),
  homeLat: z
    .union([z.number(), z.null()])
    .optional()
    .refine(
      (value) => value == null || (Number.isFinite(value) && value >= -90 && value <= 90),
      { message: "Invalid latitude" },
    ),
  homeLng: z
    .union([z.number(), z.null()])
    .optional()
    .refine(
      (value) =>
        value == null || (Number.isFinite(value) && value >= -180 && value <= 180),
      { message: "Invalid longitude" },
    ),
  address: z.string().trim().max(400),
  addressCountry: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || isProfileCountryCode(value), {
      message: "Select a valid country",
    }),
});

/**
 * Partial profile update: each info card sends only the field it edits, so
 * untouched fields must stay absent instead of being re-submitted.
 */
export const profilePatchSchema = profileFormSchema.partial();

/** Partial update: station grid + GPS from map / profile location helpers. */
export const homeLocationUpdateSchema = z.object({
  homeGrid: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .transform((value) => normalizeGrid(value))
    .refine((value) => isValidMaidenheadGrid(value), {
      message: "Enter a valid Maidenhead grid (e.g. OK30)",
    }),
  homeLat: z
    .number()
    .refine((value) => Number.isFinite(value) && value >= -90 && value <= 90, {
      message: "Invalid latitude",
    }),
  homeLng: z
    .number()
    .refine((value) => Number.isFinite(value) && value >= -180 && value <= 180, {
      message: "Invalid longitude",
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

/**
 * Standard WSJT-X dial frequencies (MHz) for FT8 / FT4 by band.
 * Bands without a common default are omitted.
 */
const FT8_FREQ_MHZ_BY_BAND: Partial<Record<QsoBand, string>> = {
  "160m": "1.840",
  "80m": "3.573",
  "60m": "5.357",
  "40m": "7.074",
  "30m": "10.136",
  "20m": "14.074",
  "17m": "18.100",
  "15m": "21.074",
  "12m": "24.915",
  "10m": "28.074",
  "6m": "50.313",
  "2m": "144.174",
  "70cm": "432.065",
};

const FT4_FREQ_MHZ_BY_BAND: Partial<Record<QsoBand, string>> = {
  "160m": "1.840",
  "80m": "3.575",
  "60m": "5.357",
  "40m": "7.048",
  "30m": "10.140",
  "20m": "14.080",
  "17m": "18.104",
  "15m": "21.140",
  "12m": "24.919",
  "10m": "28.180",
  "6m": "50.318",
  "2m": "144.170",
  "70cm": "432.065",
};

/** Suggested FT8/FT4 frequency for a band, or null if unknown / not digital. */
export function suggestedFreqMhzForModeBand(
  mode: string,
  band: string,
): string | null {
  if (mode === "FT8") return FT8_FREQ_MHZ_BY_BAND[band as QsoBand] ?? null;
  if (mode === "FT4") return FT4_FREQ_MHZ_BY_BAND[band as QsoBand] ?? null;
  return null;
}

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
  workedName: z
    .string()
    .trim()
    .max(128)
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

const MAX_PASSWORD_CHARS = 128;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(MAX_PASSWORD_CHARS).optional().default(""),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(MAX_PASSWORD_CHARS, "Password is too long"),
    confirmPassword: z.string().max(MAX_PASSWORD_CHARS),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const privacySettingsSchema = z.object({
  isProfilePublic: z.boolean(),
  isQsoPublic: z.boolean(),
  isLocationPublic: z.boolean(),
  isDocumentsPublic: z.boolean(),
});

export type PrivacySettingsValues = z.infer<typeof privacySettingsSchema>;

export const USER_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
