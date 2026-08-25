import { createHash } from "node:crypto";
import {
  buildObjectKey,
  putObject,
} from "@/lib/media/storage";
import { canonicalMediaPath } from "@/lib/media/types";
import { Media, mediaKindFromContentType } from "@/models/Media";

function posterFileName(playlistUrl: string): string {
  const hash = createHash("sha1").update(playlistUrl).digest("hex").slice(0, 12);
  return `hls-poster-${hash}.jpg`;
}

/**
 * Upload a JPEG poster buffer to media storage and register it in the library.
 * Returns the canonical `/media/...` URL stored on articles.
 */
export async function uploadHlsPosterImage(params: {
  playlistUrl: string;
  jpeg: Buffer;
  alt?: string;
}): Promise<{ key: string; url: string }> {
  const key = buildObjectKey(posterFileName(params.playlistUrl));
  const stored = await putObject(key, params.jpeg, "image/jpeg");
  const url = canonicalMediaPath(stored.key);

  await Media.create({
    key: stored.key,
    url,
    contentType: stored.contentType,
    kind: mediaKindFromContentType(stored.contentType),
    size: stored.size,
    originalName: pathBasename(params.playlistUrl),
    uploadedBy: null,
    alt: params.alt?.trim() || "HLS video poster",
  });

  return { key: stored.key, url };
}

function pathBasename(playlistUrl: string): string {
  try {
    const pathname = new URL(playlistUrl).pathname;
    const base = pathname.split("/").filter(Boolean).pop() || "stream";
    return `hls-poster-${base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40)}.jpg`;
  } catch {
    return "hls-poster.jpg";
  }
}
