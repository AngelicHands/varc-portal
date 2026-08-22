import { createHmac, randomBytes } from "crypto";

export const API_TOKEN_PREFIX = "varc_";
export const API_TOKEN_PREFIX_LENGTH = 12;
export const API_TOKEN_SCOPES = ["qso:read", "qso:write"] as const;
export const MAX_API_TOKENS_PER_USER = 10;

export function getApiTokenPepper(): string {
  return (
    process.env.API_TOKEN_PEPPER?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    ""
  );
}

export function hashApiToken(token: string): string {
  const pepper = getApiTokenPepper();
  if (!pepper) {
    throw new Error("API token pepper not configured");
  }
  return createHmac("sha256", pepper).update(token.trim()).digest("hex");
}

export function generateApiToken(): {
  token: string;
  prefix: string;
  hash: string;
} {
  const random = randomBytes(32).toString("hex");
  const token = `${API_TOKEN_PREFIX}${random}`;
  const prefix = token.slice(0, API_TOKEN_PREFIX_LENGTH);
  return { token, prefix, hash: hashApiToken(token) };
}

export function getApiPublicUrl(): string {
  return (
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_PUBLIC_URL?.trim() ||
    "http://localhost:3100"
  );
}
