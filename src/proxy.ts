import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { isAdminRole, canManageSite, canManagePages, canManageUsers, canManageRoles, pickRoleCapabilities, type Role } from "@/lib/roles";
import { routing } from "@/i18n/routing";
import { parseBareCallsignPath } from "@/lib/ham-reserved";

const intlMiddleware = createMiddleware(routing);

function pathMatches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
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

  if (pathname.startsWith("/api/") || pathname.startsWith("/media/")) {
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
          pathMatches(pathname, "/admin/menu") ||
          pathMatches(pathname, "/admin/mailbox") ||
          pathMatches(pathname, "/admin/callsigns") ||
          pathMatches(pathname, "/admin/forms") ||
          pathMatches(pathname, "/admin/templates")) &&
        !canManageSite(caps)
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
  const bareCallsign = rewriteBareCallsign(publicReq);
  if (bareCallsign) return bareCallsign;

  return intlMiddleware(publicReq);
}

function rewriteBareCallsign(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  const sign = parseBareCallsignPath(pathname);
  if (!sign) return null;

  const rawSegment = pathname.slice(1);
  if (rawSegment !== sign) {
    const canonical = req.nextUrl.clone();
    canonical.pathname = `/${sign}`;
    return NextResponse.redirect(canonical, 308);
  }

  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = `/${routing.defaultLocale}/${sign}`;
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
