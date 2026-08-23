import path from "node:path";
import { getMediaConfig } from "@/lib/media/config";
import { getPublicBaseUrl } from "@/lib/public-url";

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function hostnameFromConfiguredUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return normalizeHostname(new URL(normalized).hostname);
  } catch {
    return null;
  }
}

/** Hostnames that serve this portal's own media (site URL, media CDN, etc.). */
export function getSiteMediaHostnames(): Set<string> {
  const hostnames = new Set<string>();

  for (const value of [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.MEDIA_PUBLIC_BASE_URL,
  ]) {
    const host = hostnameFromConfiguredUrl(value);
    if (host) hostnames.add(host);
  }

  try {
    const config = getMediaConfig();
    if (config.driver === "s3") {
      const host = hostnameFromConfiguredUrl(config.publicUrl);
      if (host) hostnames.add(host);
    } else {
      const host = hostnameFromConfiguredUrl(config.publicBaseUrl ?? undefined);
      if (host) hostnames.add(host);
    }
  } catch {
    // media config unavailable
  }

  return hostnames;
}

export function isSameSiteMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("/")) {
    return trimmed.startsWith("/media/");
  }

  if (!isExternalHttpUrl(trimmed) && !trimmed.startsWith("//")) {
    return false;
  }

  const siteHostnames = getSiteMediaHostnames();
  if (siteHostnames.size === 0) return false;

  try {
    const absolute = toAbsoluteMediaUrl(trimmed);
    const hostname = normalizeHostname(new URL(absolute).hostname);
    return siteHostnames.has(hostname);
  } catch {
    return false;
  }
}

export function toAbsoluteMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${getPublicBaseUrl().replace(/\/$/, "")}${trimmed}`;
  }
  return trimmed;
}

export function fileNameFromMediaUrl(value: string): string {
  try {
    const absolute = toAbsoluteMediaUrl(value);
    const pathname = new URL(absolute).pathname;
    const base = path.basename(pathname.replace(/\\/g, "/"));
    if (base && base !== "/" && base !== ".") {
      return base;
    }
  } catch {
    // fall through
  }
  return "image.bin";
}

export function parseMediaKeyFromUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mediaPathMatch = trimmed.match(/\/media\/([^?#]+)/i);
  if (mediaPathMatch?.[1]) {
    try {
      return decodeURIComponent(mediaPathMatch[1]);
    } catch {
      return mediaPathMatch[1];
    }
  }

  try {
    const config = getMediaConfig();
    if (config.driver === "s3") {
      const prefix = `${config.publicUrl}/`;
      if (trimmed.startsWith(prefix)) {
        return trimmed.slice(prefix.length).replace(/^\/+/, "");
      }
    } else if (config.publicBaseUrl) {
      const prefix = `${config.publicBaseUrl}/media/`;
      if (trimmed.startsWith(prefix)) {
        return trimmed.slice(prefix.length);
      }
    }
  } catch {
    // media config unavailable during parse
  }

  const siteBase = getPublicBaseUrl().replace(/\/$/, "");
  const siteMediaPrefix = `${siteBase}/media/`;
  if (trimmed.startsWith(siteMediaPrefix)) {
    return trimmed.slice(siteMediaPrefix.length);
  }

  return null;
}

export function isExternalHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function mediaFileNameFromKey(key: string): string {
  const base = path.basename(key.replace(/\\/g, "/"));
  return base || "image.bin";
}

export function uniqueMediaFileName(
  key: string,
  used: Set<string>,
): string {
  const base = mediaFileNameFromKey(key);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  let index = 2;
  while (used.has(`${stem}-${index}${ext}`)) {
    index += 1;
  }
  const next = `${stem}-${index}${ext}`;
  used.add(next);
  return next;
}
