/**
 * Background worker: claim queued HLS poster jobs from MongoDB,
 * capture frames with ffmpeg, upload them, and write posters onto video tags.
 *
 * Usage:
 *   pnpm worker:hls-poster
 *
 * Requires ffmpeg on PATH (or FFMPEG_PATH).
 * Jobs are started from Admin → Advance → HLS posters.
 */
import { connectDb } from "@/lib/db";
import {
  resetHlsPosterFailureCache,
  runHlsPosterJob,
} from "@/lib/hls-poster/backfill";
import { isFfmpegAvailable } from "@/lib/hls-poster/capture";
import {
  claimNextHlsPosterJob,
  failStaleRunningHlsPosterJobs,
} from "@/lib/hls-poster/jobs";
import { logServerError } from "@/lib/safe-error";
import os from "node:os";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL_MS = Math.max(
  5_000,
  Number(process.env.HLS_POSTER_WORKER_POLL_MS || 15_000),
);
const ENABLED =
  (process.env.HLS_POSTER_WORKER_ENABLED ?? "1").trim() !== "0";

let ticks = 0;

console.log(
  `[hls-poster-worker] starting — id=${WORKER_ID} poll=${POLL_MS}ms enabled=${ENABLED ? "1" : "0"}`,
);

async function tick() {
  try {
    if (!ENABLED) {
      console.log(
        "[hls-poster-worker] disabled via HLS_POSTER_WORKER_ENABLED=0",
      );
      return;
    }

    await connectDb();

    if (!(await isFfmpegAvailable())) {
      console.error(
        "[hls-poster-worker] ffmpeg not found — install ffmpeg or set FFMPEG_PATH",
      );
      return;
    }

    ticks += 1;
    if (ticks % 12 === 0) {
      resetHlsPosterFailureCache();
    }
    if (ticks % 20 === 1) {
      const stale = await failStaleRunningHlsPosterJobs();
      if (stale > 0) {
        console.warn(`[hls-poster-worker] marked ${stale} stale job(s) failed`);
      }
    }

    const job = await claimNextHlsPosterJob(WORKER_ID);
    if (!job) {
      console.log("[hls-poster-worker] idle — no queued jobs");
      return;
    }

    const jobId = String(job._id);
    console.log(`[hls-poster-worker] claimed job ${jobId}`);
    const result = await runHlsPosterJob(jobId, job.batchLimit ?? 0);
    console.log(
      `[hls-poster-worker] job=${jobId} scanned=${result.scannedArticles} updated=${result.updatedArticles} generated=${result.postersGenerated} skipped=${result.skipped} errors=${result.errors} cancelled=${result.cancelled ? "1" : "0"}`,
    );
  } catch (error) {
    logServerError("hls-poster-worker", error);
  } finally {
    setTimeout(() => void tick(), POLL_MS).unref();
  }
}

void tick();
