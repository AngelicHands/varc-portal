import { getValkey } from "@/lib/cache/valkey";
import { makeSlug } from "@/lib/slug";
import { logServerError } from "@/lib/safe-error";
import type { RedisClientType } from "redis";

const DAY_SECONDS = 86_400;

/** Parse durations like `5m`, `1h`, `1d`, `30s`. */
export function parseMailRateLimitWindow(raw: string | undefined): number | null {
  const value = raw?.trim();
  if (!value) return null;

  const match = value.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const amount = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2]?.toLowerCase();
  const multiplier =
    unit === "s"
      ? 1
      : unit === "m"
        ? 60
        : unit === "h"
          ? 3_600
          : unit === "d"
            ? DAY_SECONDS
            : null;
  if (multiplier == null) return null;

  return amount * multiplier;
}

function parsePositiveInt(raw: string | undefined): number | null {
  const value = raw?.trim();
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type MailRateLimitConfig = {
  maxPerDay: number | null;
  perClientLimit: number | null;
  perClientWindowSec: number;
};

export function getMailRateLimitConfig(): MailRateLimitConfig {
  const perClientLimit = parsePositiveInt(process.env.CF_MAIL_RATE_LIMIT);
  const parsedWindow = parseMailRateLimitWindow(
    process.env.CF_MAIL_RATE_LIMIT_WINDOW,
  );

  return {
    maxPerDay: parsePositiveInt(process.env.CF_MAIL_MAX),
    perClientLimit,
    // Default 1h when a per-client limit is set but window is missing/invalid.
    perClientWindowSec:
      parsedWindow ?? (perClientLimit != null ? 3_600 : DAY_SECONDS),
  };
}

async function incrementCounter(
  client: RedisClientType,
  key: string,
  windowSec: number,
): Promise<number> {
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, windowSec);
  }
  return count;
}

function normalizeClientKey(clientKey: string): string {
  const slug = makeSlug(clientKey.trim()).slice(0, 80);
  return slug || "unknown";
}

export type MailRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Application-wide and per-client send quotas (Valkey counters).
 * Fail-open when Valkey is unavailable, same as form submission limits.
 */
export async function allowMailSend(
  clientKey: string,
): Promise<MailRateLimitResult> {
  const config = getMailRateLimitConfig();
  if (config.maxPerDay == null && config.perClientLimit == null) {
    return { allowed: true };
  }

  const client = await getValkey();
  if (!client) return { allowed: true };

  try {
    if (config.maxPerDay != null) {
      const count = await incrementCounter(
        client,
        "rate:mail:global",
        DAY_SECONDS,
      );
      if (count > config.maxPerDay) {
        return {
          allowed: false,
          reason: "Daily email sending limit reached for this application",
        };
      }
    }

    if (config.perClientLimit != null) {
      const key = `rate:mail:client:${normalizeClientKey(clientKey)}`;
      const count = await incrementCounter(
        client,
        key,
        config.perClientWindowSec,
      );
      if (count > config.perClientLimit) {
        return {
          allowed: false,
          reason:
            "Too many confirmation emails from your connection. Please try again later.",
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    logServerError("mail rate limit", error);
    return { allowed: true };
  }
}
