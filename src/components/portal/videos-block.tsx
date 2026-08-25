import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { ResolvedVideoItem } from "@/lib/blocks/resolve";
import { formatDateUtc7 } from "@/lib/datetime-local";

type Props = {
  videos: ResolvedVideoItem[];
  variant?: "single" | "grid";
  sectionTitle?: string;
  locale?: AppLocale;
};

function formatDate(value: string | null, locale: AppLocale = "vi") {
  if (!value) return null;
  return formatDateUtc7(value, locale === "vi" ? "vi-VN" : "en-GB");
}

function VideoThumbnail({
  video,
  locale,
  large = false,
}: {
  video: ResolvedVideoItem;
  locale: AppLocale;
  large?: boolean;
}) {
  const dateLabel = formatDate(video.publishedAt, locale);

  return (
    <div
      className={`relative overflow-hidden bg-black ${
        large ? "aspect-[16/9] w-full" : "aspect-video w-full"
      }`}
    >
      {video.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.poster}
          alt=""
          className="h-full w-full object-cover transition duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,var(--accent-soft),transparent_55%),linear-gradient(145deg,#1e293b,#0f172a)]"
          aria-hidden
        />
      )}

      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent"
        aria-hidden
      />

      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition duration-500 group-hover:scale-105 group-hover:bg-black/85 ${
          large ? "h-16 w-16" : "h-12 w-12"
        }`}
        aria-hidden
      >
        <span
          className={`ml-0.5 block border-y-transparent border-l-white border-solid ${
            large
              ? "border-y-[0.65rem] border-l-[1.05rem]"
              : "border-y-[0.5rem] border-l-[0.8rem]"
          }`}
        />
      </span>

      {dateLabel ? (
        <time
          dateTime={video.publishedAt ?? undefined}
          className={`pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 font-medium tracking-wide text-white uppercase backdrop-blur-[2px] ${
            large ? "text-xs md:bottom-3 md:left-3 md:px-2.5 md:py-1.5 md:text-sm" : "text-[0.65rem]"
          }`}
        >
          {dateLabel}
        </time>
      ) : null}
    </div>
  );
}

function GridVideoCard({
  video,
  locale,
}: {
  video: ResolvedVideoItem;
  locale: AppLocale;
}) {
  if (!video.articleSlug) return null;

  const headline = video.articleTitle || video.title;

  return (
    <Link
      href={{
        pathname: "/news/[slug]",
        params: { slug: video.articleSlug },
      }}
      className="group block"
    >
      <article>
        <VideoThumbnail video={video} locale={locale} />
        <h3 className="mt-3 font-display text-base leading-snug text-foreground transition duration-500 group-hover:text-accent md:text-lg">
          {headline}
        </h3>
      </article>
    </Link>
  );
}

function FeaturedVideoCard({
  video,
  locale,
}: {
  video: ResolvedVideoItem;
  locale: AppLocale;
}) {
  if (!video.articleSlug) return null;

  const headline = video.articleTitle || video.title;

  return (
    <Link
      href={{
        pathname: "/news/[slug]",
        params: { slug: video.articleSlug },
      }}
      className="group block"
    >
      <article>
        <VideoThumbnail video={video} locale={locale} large />
        <div className="pt-6">
          <h3 className="font-display text-2xl leading-snug text-foreground transition duration-500 group-hover:text-accent md:text-3xl">
            {headline}
          </h3>
          {video.articleExcerpt ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted md:text-base">
              {video.articleExcerpt}
            </p>
          ) : null}
        </div>
      </article>
    </Link>
  );
}

/**
 * Articles that contain HLS video, shown as video-thumbnail cards linking to the article.
 * Grid: thumbnail (with date overlay) + title. Single: featured card without a read-more link.
 */
export function VideosBlock({
  videos,
  variant = "grid",
  sectionTitle,
  locale = "vi",
}: Props) {
  const items = videos.filter((video) => video.articleSlug);
  if (!items.length) return null;

  const title = sectionTitle?.trim() || "";

  if (variant === "single") {
    const video = items[0];
    return (
      <section className="w-full border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          {title ? (
            <h2 className="mb-6 font-display text-2xl text-foreground md:mb-8 md:text-3xl">
              {title}
            </h2>
          ) : null}
          <FeaturedVideoCard video={video} locale={locale} />
        </div>
      </section>
    );
  }

  return (
    <section className="w-full space-y-6">
      {title ? (
        <h2 className="font-display text-2xl text-foreground md:text-3xl">
          {title}
        </h2>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((video) => (
          <GridVideoCard key={video.id} video={video} locale={locale} />
        ))}
      </div>
    </section>
  );
}
