import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const backupRestoreUploadLimit = Number(
  process.env.BACKUP_RESTORE_UPLOAD_MAX_BYTES || 536870912,
);

// Keep in sync with RESERVED_HAM_PATHS in src/lib/ham-reserved.ts (lowercase).
const BARE_CALLSIGN_REWRITE_PATTERN =
  "(?!_next|account|admin|api|callsigns|categories|en|favicon|logbook|maplibre|media|news|pages|qso|robots|sitemap|vi)[A-Za-z0-9]{3,15}";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["archiver", "exceljs", "unzipper"],
  experimental: {
    proxyClientMaxBodySize:
      Number.isFinite(backupRestoreUploadLimit) && backupRestoreUploadLimit > 0
        ? backupRestoreUploadLimit
        : 536870912,
  },
  async redirects() {
    return [
      // Prefer CMS favicon over any leftover static /favicon.ico from older images.
      {
        source: "/favicon.ico",
        destination: "/api/favicon",
        permanent: false,
      },
      // Legacy Vietnamese paths from localePrefix "as-needed" + localized pathnames
      {
        source: "/tin-tuc/:slug",
        destination: "/vi/news/:slug",
        permanent: true,
      },
      {
        source: "/trang/:slug",
        destination: "/vi/pages/:slug",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/media/:path*",
        destination: "/api/media/:path*",
      },
      // Bare /qso → /vi/qso (UI locale comes from the NEXT_LOCALE cookie).
      {
        source: "/qso",
        destination: "/vi/qso",
      },
      // Bare /XV1ABC → /vi/XV1ABC. Must be next.config (not middleware):
      // Next.js 16 standalone turns middleware rewrites into a self-308 loop.
      {
        source: `/:sign(${BARE_CALLSIGN_REWRITE_PATTERN})`,
        destination: "/vi/:sign",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
