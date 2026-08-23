import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import {
  isExternalHttpUrl,
  parseMediaKeyFromUrl,
} from "@/lib/import-export/media-url";
import {
  joinRepoPath,
  stripSyncRootPath,
} from "@/lib/import-export/sync-paths";
import {
  buildObjectKey,
  contentTypeForObjectKey,
  publicUrlForObjectKey,
  putObject,
} from "@/lib/media/storage";
import { Media, mediaKindFromContentType } from "@/models/Media";

export class ImportMediaResolver {
  private readonly syncRoot: string;
  private readonly files: Map<string, Buffer>;
  private readonly urlMap = new Map<string, string>();
  private readonly uploadedBy: string | null;

  constructor(params: {
    syncRoot: string;
    files: Map<string, Buffer>;
    uploadedBy: string | null;
  }) {
    this.syncRoot = params.syncRoot;
    this.files = params.files;
    this.uploadedBy = params.uploadedBy;
  }

  private resolveRepoPath(url: string): string | null {
    const trimmed = url.trim().replace(/^\.\/+/, "");
    if (!trimmed || isExternalHttpUrl(trimmed)) {
      return null;
    }

    const normalized = trimmed.replace(/^\/+/, "");
    const withRoot = joinRepoPath(this.syncRoot, normalized);
    if (this.files.has(withRoot)) return withRoot;
    if (this.files.has(normalized)) return normalized;

    const stripped = stripSyncRootPath(normalized, this.syncRoot);
    const candidate = joinRepoPath(this.syncRoot, stripped);
    if (this.files.has(candidate)) return candidate;

    return null;
  }

  async resolve(url: string): Promise<string> {
    const trimmed = url.trim();
    if (!trimmed) return "";

    const cached = this.urlMap.get(trimmed);
    if (cached !== undefined) return cached;

    if (isExternalHttpUrl(trimmed) && !parseMediaKeyFromUrl(trimmed)) {
      this.urlMap.set(trimmed, trimmed);
      return trimmed;
    }

    const existingKey = parseMediaKeyFromUrl(trimmed);
    if (existingKey) {
      try {
        const publicUrl = publicUrlForObjectKey(existingKey);
        this.urlMap.set(trimmed, publicUrl);
        return publicUrl;
      } catch {
        // fall through to bundled media lookup
      }
    }

    const repoPath = this.resolveRepoPath(trimmed);
    if (!repoPath) {
      this.urlMap.set(trimmed, trimmed);
      return trimmed;
    }

    const buffer = this.files.get(repoPath);
    if (!buffer) {
      this.urlMap.set(trimmed, trimmed);
      return trimmed;
    }

    const originalName = path.basename(repoPath);
    const key = buildObjectKey(originalName);
    const contentType = contentTypeForObjectKey(originalName);
    const stored = await putObject(key, buffer, contentType);

    await connectDb();
    const existing = await Media.findOne({ key: stored.key }).lean();
    if (!existing) {
      await Media.create({
        key: stored.key,
        url: stored.url,
        contentType: stored.contentType,
        kind: mediaKindFromContentType(stored.contentType),
        size: stored.size,
        originalName,
        uploadedBy: this.uploadedBy
          ? new mongoose.Types.ObjectId(this.uploadedBy)
          : null,
        alt: "",
      });
    }

    this.urlMap.set(trimmed, stored.url);
    return stored.url;
  }

  async resolveOptional(url: string | null | undefined): Promise<string> {
    if (!url?.trim()) return "";
    return this.resolve(url);
  }

  async resolveMarkdownImages(markdown: string): Promise<string> {
    const urls = [
      ...new Set(
        [...markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)]
          .map((match) => match[1]?.trim() ?? "")
          .filter(Boolean),
      ),
    ];
    let output = markdown;
    for (const url of urls) {
      const next = await this.resolve(url);
      if (next !== url) {
        output = output.split(url).join(next);
      }
    }
    return output;
  }

  async resolveHtmlImages(html: string): Promise<string> {
    const urls = [
      ...new Set(
        [...html.matchAll(/\bsrc=["']([^"']+)["']/gi)]
          .map((match) => match[1]?.trim() ?? "")
          .filter(Boolean),
      ),
    ];
    let output = html;
    for (const url of urls) {
      const next = await this.resolve(url);
      if (next !== url) {
        output = output.split(url).join(next);
      }
    }
    return output;
  }
}

export function loadBundledMediaFiles(params: {
  blobs: Array<{ path: string; content: Buffer }>;
}): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const blob of params.blobs) {
    map.set(blob.path.replace(/^\/+/, ""), blob.content);
  }
  return map;
}

export function isBinarySyncPath(syncRoot: string, repoPath: string): boolean {
  const relative = stripSyncRootPath(repoPath, syncRoot);
  return relative.startsWith("media/");
}
