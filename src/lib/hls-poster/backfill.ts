import {
  CmsCacheKeys,
  CmsCacheTags,
  deleteCmsKeys,
  invalidateCmsTags,
} from "@/lib/cache/cms-cache";
import {
  captureHlsPosterFrame,
  isFfmpegAvailable,
} from "@/lib/hls-poster/capture";
import {
  isHlsPosterJobCancelled,
  markHlsPosterJobCancelledFinished,
  markHlsPosterJobFailed,
  markHlsPosterJobSucceeded,
  updateHlsPosterJobProgress,
} from "@/lib/hls-poster/jobs";
import { uploadHlsPosterImage } from "@/lib/hls-poster/upload";
import {
  extractHlsVideos,
  htmlHasHlsVideoMissingPoster,
  setHlsVideoPoster,
} from "@/lib/html";
import { logServerError } from "@/lib/safe-error";
import { notDeletedFilter } from "@/lib/soft-delete";
import { Article, type ArticleDocument } from "@/models/Article";

export type HlsPosterBackfillResult = {
  scannedArticles: number;
  updatedArticles: number;
  postersGenerated: number;
  skipped: number;
  errors: number;
  cancelled: boolean;
};

export type HlsPosterBackfillOptions = {
  jobId?: string;
  /** Max articles to update this run (0 = env batch). */
  batchLimit?: number;
};

const posterCache = new Map<string, string>();
const failedSrc = new Set<string>();

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function bustArticleCaches(doc: ArticleDocument) {
  const viSlug = doc.locales?.vi?.slug?.trim() || "";
  const enSlug = doc.locales?.en?.slug?.trim() || "";
  const keys = [
    viSlug ? CmsCacheKeys.articleBySlug("vi", viSlug) : "",
    enSlug ? CmsCacheKeys.articleBySlug("en", enSlug) : "",
  ].filter(Boolean);
  await deleteCmsKeys(...keys);
  await invalidateCmsTags(
    CmsCacheTags.articles,
    CmsCacheTags.article(String(doc._id)),
  );
}

async function resolvePosterUrl(src: string): Promise<string> {
  const cached = posterCache.get(src);
  if (cached) return cached;

  const seekSeconds = Math.max(0, envNumber("HLS_POSTER_SEEK_SECONDS", 1));
  const jpeg = await captureHlsPosterFrame(src, { seekSeconds });
  const uploaded = await uploadHlsPosterImage({
    playlistUrl: src,
    jpeg,
    alt: "Auto-generated HLS poster",
  });
  posterCache.set(src, uploaded.url);
  return uploaded.url;
}

function collectMissingPosterSrcs(doc: ArticleDocument): string[] {
  const srcs = new Set<string>();
  for (const locale of ["vi", "en"] as const) {
    const html = doc.locales?.[locale]?.content ?? "";
    for (const video of extractHlsVideos(html)) {
      if (video.src && !video.poster.trim()) {
        srcs.add(video.src);
      }
    }
  }
  return [...srcs];
}

async function syncJobProgress(
  jobId: string | undefined,
  result: HlsPosterBackfillResult,
  phase: string,
  message: string,
) {
  if (!jobId) return;
  await updateHlsPosterJobProgress(jobId, {
    phase,
    message,
    articlesScanned: result.scannedArticles,
    articlesUpdated: result.updatedArticles,
    postersGenerated: result.postersGenerated,
    articlesSkipped: result.skipped,
    errorCount: result.errors,
  });
}

/**
 * One worker tick: find articles with HLS videos missing posters, generate
 * thumbnails via ffmpeg, upload them, and write `poster` onto the video tags.
 * Also fills empty `coverImageUrl` from the first generated poster.
 */
export async function runHlsPosterBackfillTick(
  options: HlsPosterBackfillOptions = {},
): Promise<HlsPosterBackfillResult> {
  const envBatch = Math.min(
    Math.max(envNumber("HLS_POSTER_WORKER_BATCH", 8), 1),
    50,
  );
  const batch =
    options.batchLimit && options.batchLimit > 0
      ? Math.min(options.batchLimit, 200)
      : envBatch;

  const result: HlsPosterBackfillResult = {
    scannedArticles: 0,
    updatedArticles: 0,
    postersGenerated: 0,
    skipped: 0,
    errors: 0,
    cancelled: false,
  };

  if (!(await isFfmpegAvailable())) {
    throw new Error(
      "ffmpeg is not available. Install ffmpeg or set FFMPEG_PATH.",
    );
  }

  await syncJobProgress(
    options.jobId,
    result,
    "scanning",
    "Scanning articles for HLS videos missing posters",
  );

  const cursor = Article.find({
    ...notDeletedFilter,
    $or: [
      { "locales.vi.content": /data-hls-src/i },
      { "locales.en.content": /data-hls-src/i },
    ],
  })
    .sort({ updatedAt: -1 })
    .cursor();

  for await (const doc of cursor) {
    if (options.jobId && (await isHlsPosterJobCancelled(options.jobId))) {
      result.cancelled = true;
      await markHlsPosterJobCancelledFinished(
        options.jobId,
        "Cancelled while scanning",
      );
      break;
    }

    result.scannedArticles += 1;

    const viHtml = doc.locales?.vi?.content ?? "";
    const enHtml = doc.locales?.en?.content ?? "";
    if (
      !htmlHasHlsVideoMissingPoster(viHtml) &&
      !htmlHasHlsVideoMissingPoster(enHtml)
    ) {
      result.skipped += 1;
      continue;
    }

    const missingSrcs = collectMissingPosterSrcs(doc);
    if (!missingSrcs.length) {
      result.skipped += 1;
      continue;
    }

    const posterBySrc = new Map<string, string>();
    let articleHadError = false;

    for (const src of missingSrcs) {
      if (options.jobId && (await isHlsPosterJobCancelled(options.jobId))) {
        result.cancelled = true;
        await markHlsPosterJobCancelledFinished(
          options.jobId,
          "Cancelled while generating posters",
        );
        break;
      }

      if (failedSrc.has(src)) {
        result.skipped += 1;
        continue;
      }
      try {
        const before = posterCache.has(src);
        const posterUrl = await resolvePosterUrl(src);
        posterBySrc.set(src, posterUrl);
        if (!before) {
          result.postersGenerated += 1;
        }
      } catch (error) {
        articleHadError = true;
        result.errors += 1;
        failedSrc.add(src);
        logServerError(`hls-poster:${src}`, error);
      }
    }

    if (result.cancelled) break;

    if (!posterBySrc.size) {
      if (articleHadError) continue;
      result.skipped += 1;
      continue;
    }

    let nextVi = viHtml;
    let nextEn = enHtml;
    for (const [src, posterUrl] of posterBySrc) {
      nextVi = setHlsVideoPoster(nextVi, src, posterUrl);
      nextEn = setHlsVideoPoster(nextEn, src, posterUrl);
    }

    const updates: Record<string, unknown> = {};
    if (nextVi !== viHtml) {
      updates["locales.vi.content"] = nextVi;
    }
    if (nextEn !== enHtml) {
      updates["locales.en.content"] = nextEn;
    }

    const cover = doc.coverImageUrl?.trim() ?? "";
    if (!cover) {
      const firstPoster = posterBySrc.values().next().value as
        | string
        | undefined;
      if (firstPoster) {
        updates.coverImageUrl = firstPoster;
      }
    }

    if (!Object.keys(updates).length) {
      result.skipped += 1;
      continue;
    }

    await Article.updateOne({ _id: doc._id }, { $set: updates });
    if (doc.status === "published") {
      await bustArticleCaches(doc);
    }
    result.updatedArticles += 1;

    await syncJobProgress(
      options.jobId,
      result,
      "processing",
      `Updated ${result.updatedArticles} article(s), generated ${result.postersGenerated} poster(s)`,
    );

    if (result.updatedArticles + result.errors >= batch) {
      break;
    }
  }

  if (options.jobId && !result.cancelled) {
    if (await isHlsPosterJobCancelled(options.jobId)) {
      result.cancelled = true;
    } else {
      const message =
        result.updatedArticles === 0 && result.errors === 0
          ? "No articles needed poster updates"
          : `Done — updated ${result.updatedArticles}, generated ${result.postersGenerated}, errors ${result.errors}`;
      await markHlsPosterJobSucceeded(options.jobId, message);
    }
  }

  return result;
}

/**
 * Claimed job runner: runs one backfill tick and marks failure on throw.
 */
export async function runHlsPosterJob(
  jobId: string,
  batchLimit = 0,
): Promise<HlsPosterBackfillResult> {
  try {
    return await runHlsPosterBackfillTick({ jobId, batchLimit });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "HLS poster job failed";
    await markHlsPosterJobFailed(jobId, message);
    throw error;
  }
}

/** Clear in-memory failure cache (e.g. after ffmpeg/network recovery). */
export function resetHlsPosterFailureCache() {
  failedSrc.clear();
}
