export type MediaKind = "image" | "video" | "file";

export type AdminMediaItem = {
  id: string;
  key: string;
  url: string;
  contentType: string;
  kind: MediaKind;
  size: number;
  originalName: string;
  alt: string;
  createdAt: string | null;
  deletedAt: string | null;
};

/** Hostname-agnostic public path stored on new uploads and library inserts. */
export function canonicalMediaPath(key: string): string {
  const normalized = key.replace(/^\/+/, "").replace(/\\/g, "/");
  return `/media/${normalized}`;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
