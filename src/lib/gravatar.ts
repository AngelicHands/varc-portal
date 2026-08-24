import { createHash } from "crypto";

type GravatarDefault = "identicon" | "404";

/** Prefer a stored photo (e.g. Google); otherwise Gravatar from email. */
export function profileAvatarUrl(
  image: string | null | undefined,
  email: string | null | undefined,
  size = 96,
  options?: { defaultImage?: GravatarDefault },
): string | null {
  const stored = image?.trim();
  if (stored) return stored;
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const hash = createHash("sha256").update(normalized).digest("hex");
  const defaultImage = options?.defaultImage ?? "identicon";
  return `https://www.gravatar.com/avatar/${hash}?d=${defaultImage}&s=${size}`;
}
