/**
 * One-shot HLS poster backfill (runs until a pass updates nothing).
 * Usage: pnpm backfill:hls-posters
 */
import { connectDb } from "@/lib/db";
import { runHlsPosterBackfillTick } from "@/lib/hls-poster/backfill";
import { isFfmpegAvailable } from "@/lib/hls-poster/capture";

async function main() {
  if (!(await isFfmpegAvailable())) {
    console.error(
      "[backfill:hls-posters] ffmpeg not found — install ffmpeg or set FFMPEG_PATH",
    );
    process.exit(1);
  }

  await connectDb();

  let totalUpdated = 0;
  let totalGenerated = 0;

  for (let pass = 1; pass <= 100; pass += 1) {
    const result = await runHlsPosterBackfillTick();
    totalUpdated += result.updatedArticles;
    totalGenerated += result.postersGenerated;
    console.log(`[backfill:hls-posters] pass=${pass}`, result);

    if (result.updatedArticles === 0) {
      break;
    }
  }

  console.log(
    `[backfill:hls-posters] done updated=${totalUpdated} generated=${totalGenerated}`,
  );
}

main().catch((error) => {
  console.error("[backfill:hls-posters]", error);
  process.exit(1);
});
