import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getPageById,
  getPageLocale,
  getPublicSiteBranding,
  getSiteSettingsDocument,
} from "@/lib/cms";
import type { AppLocale } from "@/i18n/routing";
import { TemplateLayoutRenderer } from "@/components/portal/blocks/template-layout-renderer";
import { PageFontScope } from "@/components/portal/page-font-scope";
import {
  ensureDefaultHomePage,
  resolvePageLayout,
} from "@/lib/blocks/templates";
import {
  pageContextFromPage,
  resolveLayoutBlocks,
} from "@/lib/blocks/resolve";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const tPage = await getTranslations("page");
  const [branding, settings, defaultHome] = await Promise.all([
    getPublicSiteBranding(locale),
    getSiteSettingsDocument(),
    ensureDefaultHomePage(),
  ]);

  const homeLabels = {
    readMore: t("readMore"),
    publishedAt: t("publishedAt"),
    featuredLabel: t("featuredLabel"),
    latestTitle: t("title"),
    previous: t("previousSlide"),
    next: t("nextSlide"),
    backHome: tPage("backHome"),
  };

  const assignedId = settings?.homePageId
    ? String(settings.homePageId)
    : String(defaultHome._id);

  const page =
    assignedId === String(defaultHome._id)
      ? defaultHome
      : ((await getPageById(assignedId)) ?? defaultHome);

  const content = getPageLocale(page, locale);
  const { layout } = await resolvePageLayout(page);
  const resolved = await resolveLayoutBlocks(
    layout,
    locale,
    pageContextFromPage(page, locale),
  );

  return (
    <PageFontScope fontFamily={page.fontFamily}>
      <TemplateLayoutRenderer
        layout={layout}
        resolved={resolved}
        locale={locale}
        siteName={branding.siteName}
        pageTitle={content.title || branding.siteName}
        labels={homeLabels}
      />
    </PageFontScope>
  );
}
