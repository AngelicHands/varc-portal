import type { PublicArticleCard } from "@/lib/articles";
import {
  FeaturedHero,
  type FeaturedSliderLabels,
} from "@/components/portal/featured-hero";
import { HomeFeaturedSliderClient } from "@/components/portal/home-featured-slider-client";
import type { AppLocale } from "@/i18n/routing";

type Props = {
  articles: PublicArticleCard[];
  locale: AppLocale;
  siteName: string;
  labels: FeaturedSliderLabels;
};

/**
 * Featured slider entry (Server Component).
 * One slide → static HTML only (no client JS / observers).
 * Multiple slides → thin client island for controls + autoplay.
 */
export function HomeFeaturedSlider({
  articles,
  locale,
  siteName,
  labels,
}: Props) {
  if (articles.length === 0) return null;

  if (articles.length === 1) {
    return (
      <FeaturedHero
        article={articles[0]!}
        locale={locale}
        siteName={siteName}
        labels={labels}
      />
    );
  }

  return (
    <HomeFeaturedSliderClient
      articles={articles}
      locale={locale}
      siteName={siteName}
      labels={labels}
    />
  );
}
