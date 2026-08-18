import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getMediaConfig } from "@/lib/media/config";

export type BackupArtifactRead = {
  stream: Readable;
  contentType: string;
  size?: number;
};

export type StoredBackupArtifact = {
  key: string;
  contentType: string;
  size: number;
};

function sanitizeName(value: string): string {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const trimmed = base.replace(/^-+|-+$/g, "").slice(0, 120);
  return trimmed || "backup.zip";
}

function assertSafeKey(key: string): string {
  const normalized = key.replace(/^\/+/, "").replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\0") ||
    path.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized) ||
    !/^[a-zA-Z0-9._/-]+$/.test(normalized)
  ) {
    throw new Error("Invalid backup artifact key");
  }
  return normalized;
}

type ArtifactConfig =
  | {
      driver: "local";
      artifactDir: string;
      maxAgeDays: number;
      maxCount: number;
    }
  | {
      driver: "s3";
      endpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle: boolean;
      prefix: string;
      maxAgeDays: number;
      maxCount: number;
    };

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getBackupArtifactConfig(): ArtifactConfig {
  const media = getMediaConfig();
  const maxAgeDays = parsePositiveInt(process.env.BACKUP_MAX_AGE_DAYS, 7);
  const maxCount = parsePositiveInt(process.env.BACKUP_MAX_COUNT, 10);

  if (media.driver === "s3") {
    return {
      driver: "s3",
      endpoint: media.endpoint,
      region: media.region,
      bucket: process.env.BACKUP_S3_BUCKET?.trim() || media.bucket,
      accessKey: media.accessKey,
      secretKey: media.secretKey,
      forcePathStyle: media.forcePathStyle,
      prefix:
        process.env.BACKUP_S3_PREFIX?.trim().replace(/^\/+|\/+$/g, "") ||
        "backup-artifacts",
      maxAgeDays,
      maxCount,
    };
  }

  return {
    driver: "local",
    artifactDir: path.resolve(
      process.env.BACKUP_ARTIFACT_DIR?.trim() ||
        path.join(process.cwd(), ".backup-artifacts"),
    ),
    maxAgeDays,
    maxCount,
  };
}

function createS3Client(config: Extract<ArtifactConfig, { driver: "s3" }>) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });
}

export function buildBackupArtifactKey(fileName: string, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${year}/${month}/${day}/${id}-${sanitizeName(fileName)}`;
}

export async function putBackupArtifactStream(
  key: string,
  body: Readable,
  contentType: string,
): Promise<StoredBackupArtifact> {
  const safeKey = assertSafeKey(key);
  const config = getBackupArtifactConfig();

  if (config.driver === "local") {
    const absolute = path.join(config.artifactDir, safeKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    const writer = createWriteStream(absolute);
    await pipeline(body, writer);
    const info = await stat(absolute);
    return {
      key: safeKey,
      contentType,
      size: info.size,
    };
  }

  const client = createS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: `${config.prefix}/${safeKey}`,
      Body: body,
      ContentType: contentType,
    }),
  );

  return {
    key: safeKey,
    contentType,
    size: 0,
  };
}

export async function putBackupArtifactFile(
  key: string,
  filePath: string,
  contentType: string,
): Promise<StoredBackupArtifact> {
  const info = await stat(filePath);
  const stored = await putBackupArtifactStream(
    key,
    createReadStream(filePath),
    contentType,
  );
  return {
    ...stored,
    size: info.size,
  };
}

export async function getBackupArtifactStream(
  key: string,
): Promise<BackupArtifactRead> {
  const safeKey = assertSafeKey(key);
  const config = getBackupArtifactConfig();

  if (config.driver === "local") {
    const absolute = path.join(config.artifactDir, safeKey);
    const resolvedRoot = path.resolve(config.artifactDir);
    const resolvedFile = path.resolve(absolute);
    if (
      !resolvedFile.startsWith(resolvedRoot + path.sep) &&
      resolvedFile !== resolvedRoot
    ) {
      throw new Error("Invalid backup artifact key");
    }
    if (!existsSync(resolvedFile)) throw new Error("Not found");
    const info = await stat(resolvedFile);
    return {
      stream: createReadStream(resolvedFile),
      contentType: "application/zip",
      size: info.size,
    };
  }

  const client = createS3Client(config);
  const result = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: `${config.prefix}/${safeKey}`,
    }),
  );
  if (!result.Body) throw new Error("Not found");
  return {
    stream: result.Body as Readable,
    contentType: result.ContentType || "application/zip",
    size: result.ContentLength,
  };
}

export async function deleteBackupArtifact(key: string): Promise<void> {
  const safeKey = assertSafeKey(key);
  const config = getBackupArtifactConfig();

  if (config.driver === "local") {
    const absolute = path.join(config.artifactDir, safeKey);
    const resolvedRoot = path.resolve(config.artifactDir);
    const resolvedFile = path.resolve(absolute);
    if (
      !resolvedFile.startsWith(resolvedRoot + path.sep) &&
      resolvedFile !== resolvedRoot
    ) {
      throw new Error("Invalid backup artifact key");
    }
    if (existsSync(resolvedFile)) {
      await unlink(resolvedFile);
    }
    return;
  }

  const client = createS3Client(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: `${config.prefix}/${safeKey}`,
    }),
  );
}

export function getBackupArtifactRetention() {
  const config = getBackupArtifactConfig();
  return {
    maxAgeDays: config.maxAgeDays,
    maxCount: config.maxCount,
  };
}
