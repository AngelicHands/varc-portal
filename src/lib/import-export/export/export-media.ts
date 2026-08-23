import { Readable } from "node:stream";
import {
  fileNameFromMediaUrl,
  isExternalHttpUrl,
  isSameSiteMediaUrl,
  parseMediaKeyFromUrl,
  toAbsoluteMediaUrl,
  uniqueMediaFileName,
} from "@/lib/import-export/media-url";
import { articleMediaRepoPath } from "@/lib/import-export/sync-paths";
import { getObjectStream } from "@/lib/media/storage";

const REQUEST_TIMEOUT_MS = 30_000;

export type ExportBinaryFile = {
  path: string;
  content: Buffer;
};

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readMediaKey(key: string): Promise<Buffer> {
  const { stream } = await getObjectStream(key);
  return streamToBuffer(stream as Readable);
}

async function readExternalUrl(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export class ExportMediaCollector {
  private readonly syncRoot: string;
  private readonly articleBase: string;
  private readonly files = new Map<string, Buffer>();
  private readonly urlMap = new Map<string, string>();
  private readonly usedNames = new Set<string>();

  constructor(syncRoot: string, articleBase: string) {
    this.syncRoot = syncRoot;
    this.articleBase = articleBase;
  }

  get binaryFiles(): ExportBinaryFile[] {
    return [...this.files.entries()].map(([path, content]) => ({
      path,
      content,
    }));
  }

  async resolve(url: string): Promise<string> {
    const trimmed = url.trim();
    if (!trimmed) return "";

    const cached = this.urlMap.get(trimmed);
    if (cached !== undefined) return cached;

    const mediaKey = parseMediaKeyFromUrl(trimmed);
    if (mediaKey) {
      const repoPath = await this.exportMediaKey(trimmed, mediaKey);
      if (repoPath) return repoPath;
    }

    if (isSameSiteMediaUrl(trimmed)) {
      const repoPath = await this.exportSameSiteUrl(trimmed);
      if (repoPath) return repoPath;
    }

    if (isExternalHttpUrl(trimmed)) {
      this.urlMap.set(trimmed, trimmed);
      return trimmed;
    }

    this.urlMap.set(trimmed, trimmed);
    return trimmed;
  }

  private async exportMediaKey(
    sourceUrl: string,
    mediaKey: string,
  ): Promise<string | null> {
    try {
      const fileName = uniqueMediaFileName(mediaKey, this.usedNames);
      const repoPath = articleMediaRepoPath(
        this.syncRoot,
        this.articleBase,
        fileName,
      );
      if (!this.files.has(repoPath)) {
        this.files.set(repoPath, await readMediaKey(mediaKey));
      }
      this.urlMap.set(sourceUrl, repoPath);
      return repoPath;
    } catch {
      return null;
    }
  }

  private async exportSameSiteUrl(sourceUrl: string): Promise<string | null> {
    try {
      const absolute = toAbsoluteMediaUrl(sourceUrl);
      const parsedKey = parseMediaKeyFromUrl(absolute);
      const nameSeed = parsedKey ?? fileNameFromMediaUrl(absolute);
      const fileName = uniqueMediaFileName(nameSeed, this.usedNames);
      const repoPath = articleMediaRepoPath(
        this.syncRoot,
        this.articleBase,
        fileName,
      );
      if (!this.files.has(repoPath)) {
        this.files.set(repoPath, await readExternalUrl(absolute));
      }
      this.urlMap.set(sourceUrl, repoPath);
      return repoPath;
    } catch {
      this.urlMap.set(sourceUrl, sourceUrl);
      return sourceUrl;
    }
  }

  async resolveOptional(url: string | null | undefined): Promise<string> {
    if (!url?.trim()) return "";
    return this.resolve(url);
  }
}

export { readExternalUrl, readMediaKey, streamToBuffer };
