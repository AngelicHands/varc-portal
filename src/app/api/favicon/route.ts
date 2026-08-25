import { NextResponse } from "next/server";
import { getPublicSiteBranding } from "@/lib/cms";

export const runtime = "nodejs";
/** Allow CDN/browser caching of the redirect target resolution. */
export const revalidate = 3600;

const CACHE_HEADERS = {
  // Edge can cache the redirect; browsers follow to /media (immutable).
  "Cache-Control":
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
} as const;

/**
 * Resolves the CMS favicon URL and redirects to it.
 * Prefer pointing metadata `icons` at `branding.faviconUrl` directly so browsers
 * never hit this route on normal navigations.
 */
export async function GET(request: Request) {
  const branding = await getPublicSiteBranding("vi");
  const favicon = branding.faviconUrl.trim();
  if (!favicon) {
    return new NextResponse(null, {
      status: 204,
      headers: CACHE_HEADERS,
    });
  }

  const target =
    favicon.startsWith("http://") || favicon.startsWith("https://")
      ? favicon
      : new URL(favicon, request.url).toString();

  return NextResponse.redirect(target, {
    status: 307,
    headers: CACHE_HEADERS,
  });
}
