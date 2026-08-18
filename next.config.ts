import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const backupRestoreUploadLimit = Number(
  process.env.BACKUP_RESTORE_UPLOAD_MAX_BYTES || 536870912,
);

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
    ];
  },
};

export default withNextIntl(nextConfig);
