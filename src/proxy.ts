import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { isAdminRole, canManageSite, canManagePages, canManageUsers, canManageRoles, canManageImportExport, canManageCallsigns, pickRoleCapabilities, type Role } from "@/lib/roles";
import { routing, type AppLocale } from "@/i18n/routing";
import { isReservedHamPath, parseBareCallsignPath } from "@/lib/ham-reserved";
import { PORTAL_LOCALE_HEADER } from "@/lib/portal-locale";

const intlMiddleware = createMiddleware(routing);

const LOCALE_COOKIE = "NEXT_LOCALE";
const PREFIXED_CALLSIGN_PATH = /^\/(vi|en)\/([A-Za-z0-9]{3,15})$/i;

function pathMatches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

function localeFromCookie(req: NextRequest): AppLocale {
  const raw = req.cookies.get(LOCALE_COOKIE)?.value;
  if (raw && isAppLocale(raw)) return raw;
  return routing.defaultLocale;
}

function setLocaleCookie(response: NextResponse, locale: AppLocale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * TLS terminates at Cloudflare / NPM. Rebuild the request as the public https
 * origin so alternate links and redirects are not emitted as http://.
 */
function asPublicRequest(req: NextRequest): NextRequest {
  const publicBase =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "");

  if (!publicBase?.startsWith("https://")) {
    return req;
  }

  const target = new URL(
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
    publicBase,
  );

  if (
    target.href === req.nextUrl.href &&
    req.headers.get("x-forwarded-proto") === "https"
  ) {
    return req;
  }

  const headers = new Headers(req.headers);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", target.host);
  return new NextRequest(target, {
    headers,
    method: req.method,
  });
}

function publicOrigin(req: NextRequest): string {
  return (
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    req.nextUrl.origin.replace(/^http:\/\//, "https://")
  );
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/media/") || pathname.startsWith("/maplibre/")) {
    return NextResponse.next();
  }

  // Do not wrap next-intl with auth() — Auth.js converts the result to a plain
  // Response and breaks middleware rewrites/redirects under standalone.
  if (pathname.startsWith("/admin")) {
    const isLogin = pathname === "/admin/login";
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      secureCookie: (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.startsWith(
        "https://",
      ),
    });
    const role = token?.role as Role | undefined;
    const caps = {
      role,
      ...pickRoleCapabilities(token ?? undefined),
    };
    const allowed = isAdminRole(caps);
    const origin = publicOrigin(req);
    const homeUrl = new URL(`/${routing.defaultLocale}`, origin);

    // Signed in without admin permission → portal home (not login error).
    if (token && !allowed) {
      return NextResponse.redirect(homeUrl);
    }

    if (!isLogin && !allowed) {
      const url = new URL("/admin/login", origin);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    if (isLogin && allowed) {
      return NextResponse.redirect(new URL("/admin", origin));
    }

    if (allowed) {
      const adminHome = new URL("/admin", origin);
      if (
        (pathMatches(pathname, "/admin/settings") ||
          pathMatches(pathname, "/admin/backup") ||
          pathMatches(pathname, "/admin/hls-posters") ||
          pathMatches(pathname, "/admin/menu") ||
          pathMatches(pathname, "/admin/mailbox") ||
          pathMatches(pathname, "/admin/forms") ||
          pathMatches(pathname, "/admin/templates")) &&
        !canManageSite(caps)
      ) {
        return NextResponse.redirect(adminHome);
      }
      if (
        pathMatches(pathname, "/admin/callsigns") &&
        !canManageCallsigns(caps)
      ) {
        return NextResponse.redirect(adminHome);
      }
      if (
        pathMatches(pathname, "/admin/background-jobs") &&
        !canManageSite(caps) &&
        !canManageImportExport(caps)
      ) {
        return NextResponse.redirect(adminHome);
      }
      if (pathMatches(pathname, "/admin/pages") && !canManagePages(caps)) {
        return NextResponse.redirect(adminHome);
      }
      if (pathMatches(pathname, "/admin/users") && !canManageUsers(caps)) {
        return NextResponse.redirect(adminHome);
      }
      if (pathMatches(pathname, "/admin/roles") && !canManageRoles(caps)) {
        return NextResponse.redirect(adminHome);
      }
    }

    return NextResponse.next();
  }

  const publicReq = asPublicRequest(req);

  const bareQso = handleBareLocaleMapRoute(publicReq, "qso");
  if (bareQso) return bareQso;

  const bareQth = handleBareLocaleMapRoute(publicReq, "qth");
  if (bareQth) return bareQth;

  const prefixedCallsign = redirectPrefixedCallsign(publicReq);
  if (prefixedCallsign) return prefixedCallsign;

  const bareCallsign = handleBareCallsign(publicReq);
  if (bareCallsign) return bareCallsign;

  return intlMiddleware(publicReq);
}

/** Public URL is /qso or /qth. Prefixed /vi/* and /en/* redirect to the bare path. */
function handleBareLocaleMapRoute(
  req: NextRequest,
  segment: "qso" | "qth",
): NextResponse | null {
  const { pathname } = req.nextUrl;
  const lowerPath = pathname.toLowerCase();

  const prefixedMatch = lowerPath.match(/^\/(vi|en)\/(qso|qth)$/);
  if (prefixedMatch && prefixedMatch[2] === segment) {
    const canonical = req.nextUrl.clone();
    canonical.pathname = `/${segment}`;
    return NextResponse.redirect(canonical, 308);
  }

  if (lowerPath !== `/${segment}`) return null;

  if (pathname !== `/${segment}`) {
    const canonical = req.nextUrl.clone();
    canonical.pathname = `/${segment}`;
    return NextResponse.redirect(canonical, 308);
  }

  const locale = localeFromCookie(req);
  const headers = new Headers(req.headers);
  headers.set(PORTAL_LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers } });
  setLocaleCookie(response, locale);
  return response;
}

/** /vi/XV1ABC → /XV1ABC (default locale only). /en/XV1ABC stays prefixed. */
function redirectPrefixedCallsign(req: NextRequest): NextResponse | null {
  const match = PREFIXED_CALLSIGN_PATH.exec(req.nextUrl.pathname);
  if (!match) return null;

  const localeRaw = match[1].toLowerCase();
  const sign = match[2].toUpperCase();
  if (!isAppLocale(localeRaw) || isReservedHamPath(sign)) return null;

  // Only strip the default locale so bare URLs stay the Vietnamese canonical.
  // English keeps /en/CALLSIGN (cookie + language switcher).
  if (localeRaw !== routing.defaultLocale) return null;

  const canonical = req.nextUrl.clone();
  canonical.pathname = `/${sign}`;
  const response = NextResponse.redirect(canonical, 308);
  setLocaleCookie(response, localeRaw);
  return response;
}

/**
 * Bare /XV1ABC — do not middleware-rewrite (standalone self-308 loop).
 * Default locale: next() and let next.config rewrite to /vi/CALLSIGN.
 * Other locales: redirect to /{locale}/CALLSIGN.
 */
function handleBareCallsign(publicReq: NextRequest): NextResponse | null {
  const { pathname } = publicReq.nextUrl;
  const sign = parseBareCallsignPath(pathname);
  if (!sign) return null;

  const rawSegment = pathname.slice(1);
  if (rawSegment !== sign) {
    const canonical = publicReq.nextUrl.clone();
    canonical.pathname = `/${sign}`;
    return NextResponse.redirect(canonical, 308);
  }

  const locale = localeFromCookie(publicReq);
  if (locale !== routing.defaultLocale) {
    const prefixed = publicReq.nextUrl.clone();
    prefixed.pathname = `/${locale}/${sign}`;
    const response = NextResponse.redirect(prefixed, 308);
    setLocaleCookie(response, locale);
    return response;
  }

  // next.config rewrites /CALLSIGN → /vi/CALLSIGN (middleware rewrite loops in standalone).
  const response = NextResponse.next();
  setLocaleCookie(response, routing.defaultLocale);
  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
