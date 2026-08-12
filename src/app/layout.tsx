import type { Metadata } from "next";
import localFont from "next/font/local";
import {
  Courier_Prime,
  Newsreader,
  Outfit,
  Special_Elite,
  Xanh_Mono,
} from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  variable: "--font-newsreader",
  display: "swap",
});

const specialElite = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-typewriter",
  display: "swap",
});

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-courier",
  display: "swap",
});

const xanhMono = Xanh_Mono({
  weight: "400",
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-xanh",
  display: "swap",
});

/** Bundled Courier New (regular, bold, italic, bold italic). */
const courierNew = localFont({
  src: [
    {
      path: "./fonts/courier-new/cour.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/courier-new/courbd.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/courier-new/couri.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/courier-new/courbi.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-courier-new",
  display: "swap",
  fallback: ["Courier New", "Courier", "monospace"],
});

function siteOrigin(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

const origin = siteOrigin();

// Keep this static (no DB). /_not-found is prerendered at build time; CMS
// favicon is resolved at request time via /api/favicon.
export const metadata: Metadata = {
  metadataBase: origin ? new URL(origin) : undefined,
  title: {
    default: "VARC",
    template: "%s | VARC",
  },
  description:
    "Cổng thông tin Hiệp hội Vô tuyến Nghiệp dư Việt Nam / Vietnam Amateur Radio Club portal",
  icons: {
    icon: [{ url: "/api/favicon" }],
    shortcut: [{ url: "/api/favicon" }],
    apple: [{ url: "/api/favicon" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${outfit.variable} ${newsreader.variable} ${specialElite.variable} ${courierPrime.variable} ${courierNew.variable} ${xanhMono.variable}`}
    >
      <body className="min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
