import { auth } from "@/auth";
import { ArticleCommentsSection } from "@/components/portal/article-comments-section";
import {
  commentsSectionVisible,
  isArticleCommentsSiteEnabled,
  listArticleCommentsForViewer,
  normalizeCommentsMode,
  viewerCanPostComments,
} from "@/lib/article-comments";
import {
  canViewPublishedContent,
  contentViewerFromSession,
} from "@/lib/content-access";
import { canManageArticles } from "@/lib/roles";
import type { AppLocale } from "@/i18n/routing";
import type { ArticleDocument } from "@/models/Article";
import { getTranslations } from "next-intl/server";

type Props = {
  article: ArticleDocument;
  locale: AppLocale;
};

export async function ArticleCommentsBlock({ article, locale }: Props) {
  const [siteEnabled, session, t] = await Promise.all([
    isArticleCommentsSiteEnabled(),
    auth(),
    getTranslations({ locale, namespace: "ArticleComments" }),
  ]);

  const mode = normalizeCommentsMode(article.commentsMode);
  if (!commentsSectionVisible({ siteEnabled, mode })) return null;

  const viewer = contentViewerFromSession(session);
  if (!canViewPublishedContent(article, viewer)) return null;

  const canModerate = canManageArticles(session?.user);
  const signedIn = Boolean(session?.user?.id);
  const canPost = viewerCanPostComments({
    siteEnabled,
    mode,
    canView: true,
    signedIn,
  });

  const comments = await listArticleCommentsForViewer({
    articleId: String(article._id),
    viewer,
    sessionUser: session?.user ?? {},
  });

  const slug =
    locale === "en"
      ? article.locales?.en?.slug?.trim() || article.locales?.vi?.slug?.trim()
      : article.locales?.vi?.slug?.trim() || article.locales?.en?.slug?.trim();
  const articlePath = `/${locale}/news/${slug || String(article._id)}`;

  return (
    <ArticleCommentsSection
      articleId={String(article._id)}
      locale={locale}
      articlePath={articlePath}
      initialComments={comments}
      canPost={canPost}
      canModerate={canModerate}
      signedIn={signedIn}
      labels={{
        title: t("title"),
        empty: t("empty"),
        placeholder: t("placeholder"),
        submit: t("submit"),
        submitting: t("submitting"),
        signInToComment: t("signInToComment"),
        pending: t("pending"),
        approve: t("approve"),
        reject: t("reject"),
        delete: t("delete"),
        posted: t("posted"),
      }}
    />
  );
}
