/** Fold Vietnamese diacritics and punctuation for name matching. */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCallsignQuery(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizePermitQuery(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseCallsignPrefix(sign: string): {
  prefixFamily: "XV" | "3W" | "other";
  areaDigit: string | null;
} {
  const upper = sign.toUpperCase();
  if (upper.startsWith("XV")) {
    const digit = upper[2];
    return {
      prefixFamily: "XV",
      areaDigit: digit && /\d/.test(digit) ? digit : null,
    };
  }
  if (upper.startsWith("3W")) {
    const digit = upper[2];
    return {
      prefixFamily: "3W",
      areaDigit: digit && /\d/.test(digit) ? digit : null,
    };
  }
  return { prefixFamily: "other", areaDigit: null };
}
