import {
  foldSearchText,
  normalizeCallsignQuery,
  parseCallsignPrefix,
} from "@/lib/callsigns-normalize";

export type PermitType = "GP" | "GH" | "VARC" | "unknown" | "missing";
export type LicenseStatus = "valid" | "expired" | "unknown";
export type OperatorKind = "person" | "org" | "unknown";

export type ImportEvent = {
  stt: number;
  name: string;
  operatorKey: string | null;
  operatorKind: OperatorKind;
  callsignRaw: string;
  callsigns: string[];
  permitRaw: string;
  permitNumber: string;
  permitType: PermitType;
  renewalIndex: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: LicenseStatus;
  notes: string;
  flags: string[];
};

export type ImportPayload = {
  importKey: string;
  sourceFile: string;
  sourceCreated: string;
  importedForDate: string;
  rowCount: number;
  events: ImportEvent[];
};

const ORG_KW = [
  "hoi ",
  "cong ty",
  "clb",
  "cau lac",
  "ttdt",
  "tt dt",
  "vien ",
  "truong ",
  "club",
];

const VN_SURNAMES = new Set([
  "nguyen",
  "tran",
  "le",
  "pham",
  "hoang",
  "huynh",
  "vo",
  "vu",
  "dang",
  "bui",
  "do",
  "ho",
  "ngo",
  "duong",
  "ly",
  "dinh",
  "truong",
  "doan",
  "dao",
  "mai",
  "cao",
  "lam",
  "ta",
  "to",
  "trinh",
  "than",
  "quach",
  "tu",
  "phan",
]);

const CALL_RE = /(?:3W|XV)\d[A-Z]{1,4}/g;

export function operatorKindFromName(name: string): OperatorKind {
  const folded = foldSearchText(name);
  if (ORG_KW.some((kw) => folded.includes(kw))) return "org";
  return "person";
}

export function operatorKeyFromName(name: string): string | null {
  const folded = foldSearchText(name);
  if (!folded) return null;
  const kind = operatorKindFromName(name);
  if (kind === "org") return `org:${folded}`;
  const tokens = folded.split(" ");
  const first = tokens[0] ?? "";
  if (!VN_SURNAMES.has(first) && !first.startsWith("ng") && tokens.length <= 5) {
    return `person:${[...tokens].sort().join(" ")}`;
  }
  return `person:${folded}`;
}

export function extractCallsigns(raw: string): string[] {
  const text = (raw || "").trim();
  if (!text || text === "—" || text === "-" || text === '"') return [];
  const matches = text.toUpperCase().replace(/\s+/g, "").match(CALL_RE);
  return matches ? [...new Set(matches)] : [];
}

function classifySuffix(suffix: string): {
  permitType: PermitType;
  renewalIndex: number | null;
} {
  if (suffix === "GP") return { permitType: "GP", renewalIndex: 0 };
  if (suffix === "VARC") return { permitType: "VARC", renewalIndex: null };
  const gh = /^GH(\d+)?$/.exec(suffix);
  if (gh) return { permitType: "GH", renewalIndex: Number(gh[1] || 1) };
  if (!suffix) return { permitType: "unknown", renewalIndex: null };
  return { permitType: "unknown", renewalIndex: null };
}

export function parsePermit(raw: string): {
  permitRaw: string;
  permitNumber: string;
  permitType: PermitType;
  renewalIndex: number | null;
} {
  const permitRaw = (raw || "").trim();
  if (!permitRaw || permitRaw === "—" || permitRaw === "-") {
    return {
      permitRaw,
      permitNumber: "",
      permitType: "missing",
      renewalIndex: null,
    };
  }
  const compact = permitRaw.toUpperCase().replace(/\s+/g, "");
  const primary = /^0*(\d+)(?:\/([A-Z0-9?]+))?$/.exec(compact);
  if (primary) {
    const suffix = classifySuffix(primary[2] || "");
    return {
      permitRaw,
      permitNumber: primary[1],
      permitType: suffix.permitType,
      renewalIndex: suffix.renewalIndex,
    };
  }
  const nested = /0*(\d+)\/([A-Z0-9?]+)/.exec(compact);
  if (nested) {
    const suffix = classifySuffix(nested[2] || "");
    return {
      permitRaw,
      permitNumber: nested[1],
      permitType: suffix.permitType,
      renewalIndex: suffix.renewalIndex,
    };
  }
  return {
    permitRaw,
    permitNumber: "",
    permitType: "unknown",
    renewalIndex: null,
  };
}

export function isoDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—" || trimmed === "-") return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function licenseStatusFromExpiry(
  expiryIso: string | null,
  now = new Date(),
): LicenseStatus {
  if (!expiryIso) return "unknown";
  const end = new Date(`${expiryIso}T23:59:59.000Z`);
  if (Number.isNaN(end.getTime())) return "unknown";
  return end < now ? "expired" : "valid";
}

/** Both issue and expiry are set, and expiry is not before issue. */
export function licenseHasValidDates(
  issuedAt: string | null | undefined,
  expiresAt: string | null | undefined,
): boolean {
  if (!issuedAt || !expiresAt) return false;
  return expiresAt >= issuedAt;
}

/** License period covers today (inclusive). */
export function isLicenseCurrentlyActive(
  issuedAt: string | null | undefined,
  expiresAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!licenseHasValidDates(issuedAt, expiresAt)) return false;
  const today = now.toISOString().slice(0, 10);
  return issuedAt! <= today && expiresAt! >= today;
}

export function dayBeforeIso(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Only the latest license may be active (`valid`).
 * Older events that would still look current are treated as past (`expired`).
 */
export function licenseStatusForRole(
  expiresAt: string | null | undefined,
  isLatest: boolean,
  now = new Date(),
): LicenseStatus {
  const status = licenseStatusFromExpiry(expiresAt ?? null, now);
  if (!isLatest && status === "valid") return "expired";
  return status;
}

export function buildImportEvent(input: {
  stt: number;
  name: string;
  callsignRaw: string;
  permitRaw: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string;
}): ImportEvent {
  const name = (input.name || "").trim();
  const callsignRaw = (input.callsignRaw || "").trim();
  const notes = (input.notes || "").trim();
  const callsigns = extractCallsigns(callsignRaw);
  const permit = parsePermit(input.permitRaw);
  const flags: string[] = [];
  if (!name || name === '"' || name === "—") flags.push("bad_name");
  if (callsigns.length === 0) flags.push("bad_callsign");
  if (callsignRaw.includes("?")) flags.push("uncertain_callsign");
  if (permit.permitType === "missing") flags.push("missing_license");
  if (input.permitRaw.includes("?")) flags.push("uncertain_license");
  if (!input.issuedAt) flags.push("missing_issued");
  if (!input.expiresAt) flags.push("missing_expiry");
  if (input.issuedAt && input.expiresAt && input.expiresAt < input.issuedAt) {
    flags.push("expiry_before_issue");
  }

  return {
    stt: input.stt,
    name,
    operatorKey: operatorKeyFromName(name),
    operatorKind: name ? operatorKindFromName(name) : "unknown",
    callsignRaw,
    callsigns,
    ...permit,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    status: licenseStatusFromExpiry(input.expiresAt),
    notes,
    flags,
  };
}

export function issuedRank(event: { issuedAt: string | null; stt?: number }): number {
  if (!event.issuedAt) return -1;
  return Date.parse(`${event.issuedAt}T00:00:00.000Z`);
}

export { parseCallsignPrefix, foldSearchText, normalizeCallsignQuery };
