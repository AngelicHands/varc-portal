import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CaptureHlsPosterOptions = {
  /** Seek offset in seconds before capturing a frame. Default: 1 */
  seekSeconds?: number;
  /** ffmpeg timeout in ms. Default: 90000 */
  timeoutMs?: number;
};

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

/**
 * Capture a single JPEG frame from an HLS playlist (.m3u8) via ffmpeg.
 * Requires ffmpeg on PATH (or FFMPEG_PATH).
 */
export async function captureHlsPosterFrame(
  playlistUrl: string,
  options: CaptureHlsPosterOptions = {},
): Promise<Buffer> {
  const url = playlistUrl.trim();
  if (!url) {
    throw new Error("Missing HLS playlist URL");
  }

  const seekSeconds = Math.max(0, options.seekSeconds ?? 1);
  const timeoutMs = Math.max(10_000, options.timeoutMs ?? 90_000);
  const dir = await mkdtemp(path.join(tmpdir(), "hls-poster-"));
  const outFile = path.join(dir, "poster.jpg");
  const bin = ffmpegBin();

  const run = async (args: string[]) => {
    await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
  };

  try {
    // Prefer fast input seek; fall back to output seek for stubborn playlists.
    try {
      await run([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(seekSeconds),
        "-i",
        url,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outFile,
      ]);
    } catch {
      await run([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        url,
        "-ss",
        String(seekSeconds),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outFile,
      ]);
    }

    const buffer = await readFile(outFile);
    if (!buffer.length) {
      throw new Error("ffmpeg produced an empty poster frame");
    }
    return buffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** True when ffmpeg appears available. */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(ffmpegBin(), ["-version"], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}
