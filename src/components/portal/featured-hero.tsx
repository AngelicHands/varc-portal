import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { PublicArticleCard } from "@/lib/articles";
import { coverFocusObjectPosition } from "@/lib/cover-focus";
import { formatDateUtc7 } from "@/lib/datetime-local";
import type { AppLocale } from "@/i18n/routing";

export type FeaturedSliderLabels = {
  featuredLabel: string;
  readMore: string;
  publishedAt: string;
  previous: string;
  next: string;
};

type HeroProps = {
  article: PublicArticleCard;
  locale: AppLocale;
  siteName: string;
  labels: FeaturedSliderLabels;
  /** Optional controls (multi-slide client island). */
  controls?: ReactNode;
};

function formatDate(value: string | null, locale: AppLocale) {
  if (!value) return null;
  return formatDateUtc7(value, locale === "vi" ? "vi-VN" : "en-GB");
}

/**
 * Static featured hero — server-friendly, no observers / no client state.
 * Uses CSS object-fit so paint size stays ≈ the frame (scroll-friendly).
 */
export function FeaturedHero({
  article,
  locale,
  siteName,
  labels,
  controls,
}: HeroProps) {
  const dateLabel = formatDate(article.publishedAt, locale);

  return (
    <section className="relative overflow-hidden border-b border-border bg-foreground text-surface">
      <div className="relative min-h-[42vh] md:min-h-[48vh]">
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {article.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.coverImageUrl}
              alt=""
              draggable={false}
              decoding="async"
              fetchPriority="high"
              sizes="100vw"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: coverFocusObjectPosition(article.coverImageFocus),
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,#3d7a5c,transparent_45%),linear-gradient(145deg,#1a3328,#0f1c16)]" />
          )}
          {/* Solid-ish scrim: cheaper than multi-stop gradient blending while scrolling */}
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[42vh] max-w-6xl flex-col justify-end px-4 pb-10 pt-20 md:min-h-[48vh] md:px-6 md:pb-12">
          <p className="font-display text-2xl tracking-tight text-white/90 md:text-3xl">
            {siteName}
          </p>
          <p className="mt-4 text-[10px] font-medium tracking-[0.22em] text-accent-soft uppercase">
            {labels.featuredLabel}
          </p>

          <div className="mt-2 max-w-3xl">
            <Link
              href={{
                pathname: "/news/[slug]",
                params: { slug: article.slug },
              }}
              className="group block"
            >
              {dateLabel ? (
                <time
                  dateTime={article.publishedAt ?? undefined}
                  className="text-xs tracking-wide text-white/65 uppercase"
                >
                  {labels.publishedAt} {dateLabel}
                </time>
              ) : null}
              <h1 className="mt-2 font-display text-2xl leading-[1.15] text-white transition duration-300 group-hover:text-accent-soft md:text-4xl lg:text-5xl">
                {article.title}
              </h1>
              {article.excerpt ? (
                <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-white/75 md:text-base line-clamp-2">
                  {article.excerpt}
                </p>
              ) : null}
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent-soft">
                {labels.readMore}
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px"
                >
                  ↗
                </span>
              </span>
            </Link>
          </div>

          {controls}
        </div>
      </div>
    </section>
  );
}
