import type { MetadataRoute } from "next";
import { listPublishedForSitemap, getLocaleContent } from "@/lib/articles";
import {
  listPublishedPagesForSitemap,
  getPageLocale,
} from "@/lib/cms";
import { listCallsignsForSitemap } from "@/lib/callsigns";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3099";
  const [articles, pages, callsigns] = await Promise.all([
    listPublishedForSitemap().catch(() => []),
    listPublishedPagesForSitemap().catch(() => []),
    listCallsignsForSitemap().catch(() => []),
  ]);

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/vi`,
      lastModified: new Date(),
      alternates: {
        languages: { vi: `${siteUrl}/vi`, en: `${siteUrl}/en` },
      },
    },
    {
      url: `${siteUrl}/en`,
      lastModified: new Date(),
      alternates: {
        languages: { vi: `${siteUrl}/vi`, en: `${siteUrl}/en` },
      },
    },
    {
      url: `${siteUrl}/vi/callsigns`,
      lastModified: new Date(),
      alternates: {
        languages: {
          vi: `${siteUrl}/vi/callsigns`,
          en: `${siteUrl}/en/callsigns`,
        },
      },
    },
    {
      url: `${siteUrl}/en/callsigns`,
      lastModified: new Date(),
      alternates: {
        languages: {
          vi: `${siteUrl}/vi/callsigns`,
          en: `${siteUrl}/en/callsigns`,
        },
      },
    },
  ];

  for (const article of articles) {
    const vi = getLocaleContent(article, "vi");
    const en = getLocaleContent(article, "en");
    const lastModified = article.updatedAt
      ? new Date(article.updatedAt)
      : new Date();

    if (vi.slug) {
      entries.push({
        url: `${siteUrl}/vi/news/${vi.slug}`,
        lastModified,
        alternates: {
          languages: {
            vi: `${siteUrl}/vi/news/${vi.slug}`,
            ...(en.slug ? { en: `${siteUrl}/en/news/${en.slug}` } : {}),
          },
        },
      });
    }
    if (en.slug) {
      entries.push({
        url: `${siteUrl}/en/news/${en.slug}`,
        lastModified,
        alternates: {
          languages: {
            ...(vi.slug ? { vi: `${siteUrl}/vi/news/${vi.slug}` } : {}),
            en: `${siteUrl}/en/news/${en.slug}`,
          },
        },
      });
    }
  }

  for (const page of pages) {
    const vi = getPageLocale(page, "vi");
    const en = getPageLocale(page, "en");
    const lastModified = page.updatedAt
      ? new Date(page.updatedAt)
      : new Date();

    if (vi.slug) {
      entries.push({
        url: `${siteUrl}/vi/pages/${vi.slug}`,
        lastModified,
        alternates: {
          languages: {
            vi: `${siteUrl}/vi/pages/${vi.slug}`,
            ...(en.slug ? { en: `${siteUrl}/en/pages/${en.slug}` } : {}),
          },
        },
      });
    }
    if (en.slug) {
      entries.push({
        url: `${siteUrl}/en/pages/${en.slug}`,
        lastModified,
        alternates: {
          languages: {
            ...(vi.slug ? { vi: `${siteUrl}/vi/pages/${vi.slug}` } : {}),
            en: `${siteUrl}/en/pages/${en.slug}`,
          },
        },
      });
    }
  }

  for (const sign of callsigns) {
    entries.push({
      url: `${siteUrl}/vi/callsigns/${sign}`,
      lastModified: new Date(),
      alternates: {
        languages: {
          vi: `${siteUrl}/vi/callsigns/${sign}`,
          en: `${siteUrl}/en/callsigns/${sign}`,
        },
      },
    });
    entries.push({
      url: `${siteUrl}/en/callsigns/${sign}`,
      lastModified: new Date(),
      alternates: {
        languages: {
          vi: `${siteUrl}/vi/callsigns/${sign}`,
          en: `${siteUrl}/en/callsigns/${sign}`,
        },
      },
    });
  }

  return entries;
}
