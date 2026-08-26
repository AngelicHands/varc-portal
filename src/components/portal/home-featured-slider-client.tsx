"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { PublicArticleCard } from "@/lib/articles";
import {
  FeaturedHero,
  type FeaturedSliderLabels,
} from "@/components/portal/featured-hero";
import type { AppLocale } from "@/i18n/routing";

type Props = {
  articles: PublicArticleCard[];
  locale: AppLocale;
  siteName: string;
  labels: FeaturedSliderLabels;
};

const AUTO_MS = 7000;

/** Multi-slide only — single-slide pages never load this module. */
export function HomeFeaturedSliderClient({
  articles,
  locale,
  siteName,
  labels,
}: Props) {
  const [index, setIndex] = useState(0);
  const count = articles.length;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      const target = ((next % count) + count) % count;
      setIndex((current) => (current === target ? current : target));
    },
    [count],
  );

  const onAutoAdvance = useEffectEvent(() => {
    if (document.visibilityState !== "visible") return;
    goTo(index + 1);
  });

  useEffect(() => {
    if (count <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => onAutoAdvance(), AUTO_MS);
    return () => window.clearInterval(id);
  }, [count, index]);

  useEffect(() => {
    if (count <= 1) return;
    const next = articles[(index + 1) % count];
    const src = next?.coverImageUrl;
    if (!src) return;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }, [articles, count, index]);

  const active = articles[index];
  if (!active) return null;

  return (
    <FeaturedHero
      article={active}
      locale={locale}
      siteName={siteName}
      labels={labels}
      controls={
        <div className="relative z-20 mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label={labels.previous}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white transition hover:bg-white/15"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label={labels.next}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white transition hover:bg-white/15"
            >
              →
            </button>
          </div>
          <div
            className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1"
            role="tablist"
          >
            {articles.map((article, i) => (
              <button
                key={article.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1} / ${count}`}
                onClick={() => goTo(i)}
                className={`h-1.5 shrink-0 rounded-full transition-[width,background-color] duration-300 ${
                  i === index
                    ? "w-8 bg-accent-soft"
                    : "w-1.5 bg-white/35 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-white/60 sm:hidden">
            {index + 1} / {count}
          </p>
        </div>
      }
    />
  );
}
