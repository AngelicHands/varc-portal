import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import {
  getLocaleContent,
  getPublishedArticleBySlug,
  hasLocaleContent,
} from "@/lib/articles";
import {
  getPublicSiteBranding,
  getSiteSettingsDocument,
} from "@/lib/cms";
import { canManageArticles } from "@/lib/roles";
import {
  canViewPublishedContent,
  contentViewerFromSession,
} from "@/lib/content-access";
import type { AppLocale } from "@/i18n/routing";
import { ArticleBody } from "@/components/portal/article-body";
import { ArticleCommentsBlock } from "@/components/portal/article-comments-block";
import { PageEditButton } from "@/components/portal/page-edit-button";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { TemplateLayoutRenderer } from "@/components/portal/blocks/template-layout-renderer";
import { AdminAuthorAvatar } from "@/components/admin/admin-author-avatar";
import { newsHref } from "@/lib/locale-hrefs";
import { formatDateUtc7 } from "@/lib/datetime-local";
import { profileAvatarUrl } from "@/lib/gravatar";
import { connectDb } from "@/lib/db";
import { User } from "@/models/User";
import mongoose from "mongoose";
import {
  getPageTemplateByKey,
  parseLayout,
} from "@/lib/blocks/templates";
import { resolveLayoutBlocks } from "@/lib/blocks/resolve";
import { emptyLayout } from "@/lib/blocks/types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;
  const locale = localeParam as AppLocale;
  const [article, session] = await Promise.all([
    getPublishedArticleBySlug(locale, slug),
    auth(),
  ]);
  if (!article) return { title: "Not found" };

  const userId = session?.user?.id ? String(session.user.id) : "";
  const authorId = article.authorId ? String(article.authorId) : "";
  const canBypass =
    Boolean(userId) &&
    (canManageArticles(session?.user) ||
      (authorId !== "" && authorId === userId));
  if (
    !canViewPublishedContent(article, {
      id: userId || null,
      role: session?.user?.role,
      canBypass,
    })
  ) {
    return { title: "Not found" };
  }

  const content = getLocaleContent(article, locale);
  const branding = await getPublicSiteBranding(locale);
  const pageName = content.metaTitle || content.title;
  const documentTitle = `${pageName} - ${branding.siteName} | ${branding.siteTitle}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3099";
  const path = `/${locale}/news/${content.slug}`;
  const en = getLocaleContent(article, "en");
  const vi = getLocaleContent(article, "vi");

  return {
    title: pageName,
    description: content.metaDescription || content.excerpt,
    alternates: {
      canonical: `${siteUrl}${path}`,
      languages: {
        vi: vi.slug ? `${siteUrl}/vi/news/${vi.slug}` : undefined,
        en: en.slug ? `${siteUrl}/en/news/${en.slug}` : undefined,
        "x-default": vi.slug ? `${siteUrl}/vi/news/${vi.slug}` : undefined,
      },
    },
    keywords: article.tags?.length ? article.tags.join(", ") : undefined,
    openGraph: {
      title: documentTitle,
      description: content.metaDescription || content.excerpt,
      url: `${siteUrl}${path}`,
      type: "article",
      images: article.ogImageUrl || article.coverImageUrl || undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { locale: localeParam, slug } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const t = await getTranslations("article");
  const tHome = await getTranslations("home");
  const tPage = await getTranslations("page");
  const [article, session, settings, branding] = await Promise.all([
    getPublishedArticleBySlug(locale, slug),
    auth(),
    getSiteSettingsDocument(),
    getPublicSiteBranding(locale),
  ]);
  if (!article || !hasLocaleContent(article, locale)) {
    notFound();
  }

  const content = getLocaleContent(article, locale);
  const vi = getLocaleContent(article, "vi");
  const en = getLocaleContent(article, "en");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3099";
  const path = `/${locale}/news/${content.slug}`;
  const articleId = String(article._id);
  const authorId = article.authorId ? String(article.authorId) : "";
  const userId = session?.user?.id ? String(session.user.id) : "";
  const canEdit =
    Boolean(userId) &&
    (canManageArticles(session?.user) ||
      (authorId !== "" && authorId === userId));
  if (
    !canViewPublishedContent(article, {
      id: userId || null,
      role: session?.user?.role,
      canBypass: canEdit,
    })
  ) {
    notFound();
  }
  const editButton = canEdit ? (
    <PageEditButton
      href={`/admin/articles/${articleId}`}
      label={t("edit")}
    />
  ) : null;

  let authorDisplay: { label: string; avatarUrl: string | null } | null = null;
  if (authorId && mongoose.isValidObjectId(authorId)) {
    await connectDb();
    const author = await User.findById(authorId)
      .select("name callsign email image")
      .lean<{
        name?: string;
        callsign?: string;
        email?: string;
        image?: string | null;
      } | null>();
    if (author) {
      const label =
        author.name?.trim() ||
        author.callsign?.trim() ||
        author.email?.trim() ||
        "";
      if (label) {
        authorDisplay = {
          label,
          avatarUrl: profileAvatarUrl(author.image, author.email, 64, {
            defaultImage: "404",
          }),
        };
      }
    }
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: content.title,
    description: content.excerpt,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    inLanguage: locale,
    image: article.coverImageUrl || undefined,
    mainEntityOfPage: `${siteUrl}${path}`,
    author: authorDisplay
      ? { "@type": "Person", name: authorDisplay.label }
      : undefined,
  };

  const byline = (
    <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted">
      {article.publishedAt ? (
        <time dateTime={new Date(article.publishedAt).toISOString()}>
          {formatDateUtc7(
            article.publishedAt,
            locale === "vi" ? "vi-VN" : "en-GB",
            { month: "long" },
          )}
        </time>
      ) : (
        <span />
      )}
      {authorDisplay ? (
        <div className="ml-auto flex min-w-0 items-center gap-2 text-right">
          <AdminAuthorAvatar
            src={authorDisplay.avatarUrl}
            label={authorDisplay.label}
            compact
          />
          <span className="min-w-0 truncate font-medium text-foreground">
            {authorDisplay.label}
          </span>
        </div>
      ) : null}
    </div>
  );

  const articleTemplateKey = settings?.articleTemplateKey?.trim() || "article";
  // Non-default key opts into block template rendering for article routes.
  if (articleTemplateKey !== "article") {
    const template = await getPageTemplateByKey(articleTemplateKey);
    const layout = parseLayout(template?.layout) ?? emptyLayout();
    if (layout.sections.some((s) => s.blocks.length > 0)) {
      const resolved = await resolveLayoutBlocks(
        layout,
        locale,
        {
          title: content.title,
          contentHtml: content.content,
          galleryItems: [],
        },
        {
          categoryIds: (article.categoryIds ?? []).map(String),
          viewer: contentViewerFromSession(session, canEdit),
        },
      );
      return (
        <div className="relative py-10 md:py-14">
          {editButton}
          <SetLocaleAlternates
            vi={vi.slug ? newsHref(vi.slug) : null}
            en={en.slug ? newsHref(en.slug) : null}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <div className="mx-auto mb-6 max-w-6xl px-4 md:px-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-accent transition hover:underline"
            >
              {t("backToNews")}
            </Link>
          </div>
          <TemplateLayoutRenderer
            layout={layout}
            resolved={resolved}
            locale={locale}
            siteName={branding.siteName}
            pageTitle={content.title}
            labels={{
              readMore: tHome("readMore"),
              publishedAt: tHome("publishedAt"),
              featuredLabel: tHome("featuredLabel"),
              latestTitle: tHome("title"),
              previous: tHome("previousSlide"),
              next: tHome("nextSlide"),
              backHome: tPage("backHome"),
            }}
          />
          <div className="mx-auto mt-4 max-w-6xl px-4 md:px-6">
            <ArticleCommentsBlock article={article} locale={locale} />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="relative">
      {editButton}
      <article className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
      <SetLocaleAlternates
        vi={vi.slug ? newsHref(vi.slug) : null}
        en={en.slug ? newsHref(en.slug) : null}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-accent transition hover:underline"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18 9 12l6-6" />
        </svg>
        {t("backToNews")}
      </Link>
      <header className="mt-6 border-b border-border pb-8">
        <h1 className="font-display text-4xl leading-tight text-foreground md:text-5xl">
          {content.title}
        </h1>
        {byline}
        {content.excerpt ? (
          <p className="mt-4 text-lg text-muted">{content.excerpt}</p>
        ) : null}
        {article.tags?.length ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <li
                key={tag}
                className="rounded border border-border px-2.5 py-1 text-xs text-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      {article.coverImageUrl || content.content ? (
        <ArticleBody
          html={content.content}
          title={content.title}
          coverImageUrl={article.coverImageUrl || undefined}
          coverImageFocus={article.coverImageFocus}
        />
      ) : null}
      <ArticleCommentsBlock article={article} locale={locale} />
    </article>
    </div>
  );
}
