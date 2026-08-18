import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as archiver from "archiver";
import { EJSON } from "bson";
import unzipper from "unzipper";
import { connectDb } from "@/lib/db";
import {
  buildBackupArtifactKey,
  deleteBackupArtifact,
  getBackupArtifactStream,
  putBackupArtifactFile,
} from "@/lib/backup/artifact-storage";
import {
  cleanupBackupArtifacts,
  isBackupJobCancelled,
  markBackupEmailSent,
  markBackupJobFailed,
  markBackupJobSucceeded,
  updateBackupJobProgress,
} from "@/lib/backup/jobs";
import {
  BACKUP_COLLECTION_NAMES,
  getBackupCollectionByName,
} from "@/lib/backup/registry";
import { invalidateCmsTags } from "@/lib/cache/cms-cache";
import { sendBackupReadyEmail } from "@/lib/mail/backup-email";
import {
  contentTypeForObjectKey,
  deleteObject,
  getObjectStream,
  publicUrlForObjectKey,
  putObjectStream,
} from "@/lib/media/storage";
import { publicErrorMessage } from "@/lib/safe-error";
import { BackupJob, type BackupJobDocument } from "@/models/BackupJob";
import { FormSubmission } from "@/models/FormSubmission";
import { Media } from "@/models/Media";
import { isFormUploadValue } from "@/lib/validations/forms";

type BackupManifest = {
  formatVersion: 1;
  appVersion: string;
  createdAt: string;
  createdByEmail: string;
  collectionNames: string[];
  mediaCount: number;
  mediaBytes: number;
  missingMedia: string[];
  storageDriver: string;
  sourcePublicMediaBaseUrl: string;
};

type BackupMediaEntry = {
  key: string;
  contentType: string;
  size: number;
};

class BackupJobCancelledError extends Error {
  constructor() {
    super("Backup job cancelled");
    this.name = "BackupJobCancelledError";
  }
}

async function throwIfJobCancelled(id: string) {
  if (await isBackupJobCancelled(id)) {
    throw new BackupJobCancelledError();
  }
}

function getAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return String(require("../../../package.json").version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function getPublicBaseUrl() {
  return (
    process.env.AUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3099"
  );
}

function getSourcePublicMediaBaseUrl() {
  const sample = publicUrlForObjectKey("sample.txt");
  return sample.endsWith("/media/sample.txt")
    ? sample.slice(0, -"/media/sample.txt".length)
    : sample.slice(0, -"sample.txt".length).replace(/\/$/, "");
}

function buildBackupFileName(now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  return `varc-backup-${stamp}.zip`;
}

function sanitizeUploadName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "backup.zip";
}

function extractFormUploadKeys(payload: unknown): BackupMediaEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const entries: BackupMediaEntry[] = [];
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (!isFormUploadValue(value)) continue;
    entries.push({
      key: value.key,
      contentType: value.contentType || contentTypeForObjectKey(value.key),
      size: value.size || 0,
    });
  }
  return entries;
}

async function collectBackupMediaEntries(): Promise<BackupMediaEntry[]> {
  const [mediaDocs, submissionDocs] = await Promise.all([
    Media.find({}, { key: 1, contentType: 1, size: 1 }).lean(),
    FormSubmission.find({}, { payload: 1 }).lean(),
  ]);
  const byKey = new Map<string, BackupMediaEntry>();

  for (const doc of mediaDocs) {
    const key = String(doc.key || "").trim();
    if (!key) continue;
    byKey.set(key, {
      key,
      contentType: String(doc.contentType || contentTypeForObjectKey(key)),
      size: Number(doc.size || 0),
    });
  }

  for (const doc of submissionDocs) {
    for (const upload of extractFormUploadKeys(doc.payload)) {
      if (!byKey.has(upload.key)) byKey.set(upload.key, upload);
    }
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function writeCollectionJsonl(params: {
  collectionName: string;
  outputPath: string;
}): Promise<void> {
  const entry = getBackupCollectionByName(params.collectionName);
  if (!entry) throw new Error(`Unknown collection: ${params.collectionName}`);
  await mkdir(path.dirname(params.outputPath), { recursive: true });
  const writer = createWriteStream(params.outputPath, { encoding: "utf8" });
  const cursor = entry.collection.find({});
  for await (const doc of cursor) {
    writer.write(EJSON.stringify(doc, { relaxed: false }));
    writer.write("\n");
  }
  await new Promise<void>((resolve, reject) => {
    writer.end(() => resolve());
    writer.on("error", reject);
  });
}

function createArchiveManifest(params: {
  requestedByEmail: string;
  mediaEntries: BackupMediaEntry[];
  missingMedia: string[];
}): BackupManifest {
  return {
    formatVersion: 1,
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    createdByEmail: params.requestedByEmail,
    collectionNames: [...BACKUP_COLLECTION_NAMES],
    mediaCount: params.mediaEntries.length,
    mediaBytes: params.mediaEntries.reduce((sum, entry) => sum + entry.size, 0),
    missingMedia: [...params.missingMedia],
    storageDriver: process.env.STORAGE_DRIVER?.trim().toLowerCase() || "local",
    sourcePublicMediaBaseUrl: getSourcePublicMediaBaseUrl(),
  };
}

async function buildBackupArchive(job: BackupJobDocument): Promise<{
  filePath: string;
  fileName: string;
  manifest: BackupManifest;
}> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "varc-backup-"));
  const jsonDir = path.join(tempDir, "mongo");
  const archivePath = path.join(tempDir, buildBackupFileName());
  const missingMedia: string[] = [];

  try {
    await throwIfJobCancelled(String(job._id));
    await updateBackupJobProgress(String(job._id), {
      phase: "collecting",
      message: "Collecting media references",
      collectionsDone: 0,
      collectionsTotal: BACKUP_COLLECTION_NAMES.length,
    });

    const mediaEntries = await collectBackupMediaEntries();
    await updateBackupJobProgress(String(job._id), {
      mediaDone: 0,
      mediaTotal: mediaEntries.length,
      bytesTotal: mediaEntries.reduce((sum, entry) => sum + entry.size, 0),
    });

    let collectionsDone = 0;
    for (const collectionName of BACKUP_COLLECTION_NAMES) {
      await throwIfJobCancelled(String(job._id));
      await updateBackupJobProgress(String(job._id), {
        phase: "dumping-mongo",
        message: `Exporting ${collectionName}`,
        collectionsDone,
      });
      await writeCollectionJsonl({
        collectionName,
        outputPath: path.join(jsonDir, `${collectionName}.jsonl`),
      });
      collectionsDone += 1;
      await updateBackupJobProgress(String(job._id), {
        collectionsDone,
      });
    }

    await updateBackupJobProgress(String(job._id), {
      phase: "archiving",
      message: "Compressing backup archive",
      collectionsDone,
      mediaDone: 0,
    });

    await new Promise<void>(async (resolve, reject) => {
      const output = createWriteStream(archivePath);
      const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
      let mediaDone = 0;
      let bytesDone = 0;

      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      for (const collectionName of BACKUP_COLLECTION_NAMES) {
        archive.file(path.join(jsonDir, `${collectionName}.jsonl`), {
          name: `mongo/${collectionName}.jsonl`,
        });
      }

      for (const media of mediaEntries) {
        await throwIfJobCancelled(String(job._id));
        try {
          const object = await getObjectStream(media.key);
          archive.append(object.stream, {
            name: `media/${media.key}`,
          });
          mediaDone += 1;
          bytesDone += media.size;
          await updateBackupJobProgress(String(job._id), {
            mediaDone,
            bytesDone,
            message: `Archived ${media.key}`,
          });
        } catch {
          missingMedia.push(media.key);
        }
      }

      const manifest = createArchiveManifest({
        requestedByEmail: job.requestedByEmail,
        mediaEntries,
        missingMedia,
      });
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

      archive.finalize().catch(reject);
    });

    const finalManifest = createArchiveManifest({
      requestedByEmail: job.requestedByEmail,
      mediaEntries,
      missingMedia,
    });

    return {
      filePath: archivePath,
      fileName: path.basename(archivePath),
      manifest: finalManifest,
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function downloadSourceZip(job: BackupJobDocument, tempDir: string): Promise<string> {
  const targetPath = path.join(
    tempDir,
    sanitizeUploadName(job.sourceFileName || "restore-source.zip"),
  );
  await updateBackupJobProgress(String(job._id), {
    phase: "fetching-source",
    message:
      job.sourceType === "remote"
        ? "Downloading remote backup"
        : "Reading uploaded backup",
  });

  if (job.sourceType === "artifact" || job.sourceType === "upload") {
    if (!job.sourceArtifactKey) throw new Error("Missing uploaded backup artifact");
    const source = await getBackupArtifactStream(job.sourceArtifactKey);
    await pipeline(source.stream, createWriteStream(targetPath));
    return targetPath;
  }

  if (job.sourceType !== "remote") {
    throw new Error("Unsupported restore source");
  }

  const remoteUrl = await validateRemoteBackupUrl(job.sourceRemoteUrl);
  const response = await fetch(remoteUrl, { redirect: "error" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download remote backup (HTTP ${response.status})`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
  return targetPath;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

async function validateRemoteBackupUrl(value: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid remote URL");
  }
  if (url.protocol !== "https:") throw new Error("Remote backup URL must use HTTPS");
  if (url.username || url.password) throw new Error("Remote backup URL must not include credentials");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Remote backup URL host is not allowed");
  }
  const directIp = isIP(hostname) ? hostname : null;
  if (directIp && isPrivateIp(directIp)) {
    throw new Error("Remote backup URL host is not allowed");
  }
  if (!directIp) {
    const resolved = await lookup(hostname);
    if (!resolved?.address || isPrivateIp(resolved.address)) {
      throw new Error("Remote backup URL host is not allowed");
    }
  }
  return url.toString();
}

async function readManifest(directory: unzipper.CentralDirectory): Promise<BackupManifest> {
  const manifestEntry = directory.files.find((entry) => entry.path === "manifest.json");
  if (!manifestEntry) throw new Error("Backup manifest is missing");
  const raw = await manifestEntry.buffer();
  const manifest = JSON.parse(raw.toString("utf8")) as BackupManifest;
  if (manifest.formatVersion !== 1) {
    throw new Error("Unsupported backup format");
  }
  return manifest;
}

function rewriteSubmissionPayloadUrls(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...(payload as Record<string, unknown>) };
  for (const [key, value] of Object.entries(next)) {
    if (!isFormUploadValue(value)) continue;
    next[key] = {
      ...value,
      url: publicUrlForObjectKey(value.key),
    };
  }
  return next;
}

async function restoreCollectionFromEntry(params: {
  collectionName: string;
  entry: unzipper.File;
}): Promise<void> {
  const backupCollection = getBackupCollectionByName(params.collectionName);
  if (!backupCollection) {
    throw new Error(`Unknown collection in backup: ${params.collectionName}`);
  }

  await backupCollection.collection.deleteMany({});

  const rl = readline.createInterface({
    input: params.entry.stream(),
    crlfDelay: Infinity,
  });
  let batch: Record<string, unknown>[] = [];

  for await (const line of rl) {
    const trimmed = String(line).trim();
    if (!trimmed) continue;
    const parsed = EJSON.parse(trimmed) as Record<string, unknown>;
    if (params.collectionName === FormSubmission.collection.collectionName) {
      parsed.payload = rewriteSubmissionPayloadUrls(parsed.payload);
    } else if (params.collectionName === Media.collection.collectionName) {
      parsed.url = publicUrlForObjectKey(String(parsed.key || ""));
    }
    batch.push(parsed);
    if (batch.length >= 100) {
      await backupCollection.collection.insertMany(batch, { ordered: false });
      batch = [];
    }
  }
  if (batch.length > 0) {
    await backupCollection.collection.insertMany(batch, { ordered: false });
  }
}

async function collectCurrentManagedKeys(): Promise<Set<string>> {
  const [mediaDocs, formDocs] = await Promise.all([
    Media.find({}, { key: 1 }).lean(),
    FormSubmission.find({}, { payload: 1 }).lean(),
  ]);
  const keys = new Set<string>();
  for (const doc of mediaDocs) {
    const key = String(doc.key || "").trim();
    if (key) keys.add(key);
  }
  for (const doc of formDocs) {
    for (const upload of extractFormUploadKeys(doc.payload)) {
      keys.add(upload.key);
    }
  }
  return keys;
}

async function restoreMediaEntries(params: {
  directory: unzipper.CentralDirectory;
  jobId: string;
}): Promise<Set<string>> {
  const mediaEntries = params.directory.files.filter((entry) =>
    entry.path.startsWith("media/"),
  );
  const restoredKeys = new Set<string>();
  let mediaDone = 0;

  await updateBackupJobProgress(params.jobId, {
    mediaDone: 0,
    mediaTotal: mediaEntries.length,
    phase: "restoring-media",
    message: "Restoring media files",
  });

  for (const entry of mediaEntries) {
    await throwIfJobCancelled(params.jobId);
    const key = entry.path.slice("media/".length);
    await putObjectStream(
      key,
      entry.stream(),
      contentTypeForObjectKey(key),
    );
    restoredKeys.add(key);
    mediaDone += 1;
    await updateBackupJobProgress(params.jobId, {
      mediaDone,
      message: `Restored ${key}`,
    });
  }

  return restoredKeys;
}

async function removeOldManagedKeys(
  currentKeys: Set<string>,
  restoredKeys: Set<string>,
): Promise<void> {
  for (const key of currentKeys) {
    if (restoredKeys.has(key)) continue;
    try {
      await deleteObject(key);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

async function restoreBackupArchive(job: BackupJobDocument): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "varc-restore-"));
  try {
    await throwIfJobCancelled(String(job._id));
    const currentKeys = await collectCurrentManagedKeys();
    const zipPath = await downloadSourceZip(job, tempDir);
    const directory = await unzipper.Open.file(zipPath);
    const manifest = await readManifest(directory);
    const collectionEntries = directory.files.filter((entry) =>
      entry.path.startsWith("mongo/"),
    );
    const collectionNames = collectionEntries.map((entry) =>
      entry.path.replace(/^mongo\//, "").replace(/\.jsonl$/, ""),
    );

    for (const name of collectionNames) {
      if (!BACKUP_COLLECTION_NAMES.includes(name)) {
        throw new Error(`Backup contains unsupported collection: ${name}`);
      }
    }

    if (
      collectionNames.length !== BACKUP_COLLECTION_NAMES.length ||
      BACKUP_COLLECTION_NAMES.some((name) => !collectionNames.includes(name))
    ) {
      throw new Error("Backup is missing one or more required collections");
    }

    await updateBackupJobProgress(String(job._id), {
      phase: "restoring-mongo",
      message: "Replacing MongoDB collections",
      collectionsDone: 0,
      collectionsTotal: BACKUP_COLLECTION_NAMES.length,
      mediaDone: 0,
      mediaTotal: directory.files.filter((entry) => entry.path.startsWith("media/")).length,
    });

    let collectionsDone = 0;
    for (const collectionName of BACKUP_COLLECTION_NAMES) {
      await throwIfJobCancelled(String(job._id));
      const entry = collectionEntries.find(
        (item) => item.path === `mongo/${collectionName}.jsonl`,
      );
      if (!entry) throw new Error(`Missing collection file for ${collectionName}`);
      await restoreCollectionFromEntry({ collectionName, entry });
      collectionsDone += 1;
      await updateBackupJobProgress(String(job._id), {
        collectionsDone,
        message: `Restored ${collectionName}`,
      });
    }

    const restoredKeys = await restoreMediaEntries({
      directory,
      jobId: String(job._id),
    });
    await removeOldManagedKeys(currentKeys, restoredKeys);

    await invalidateCmsTags(
      "branding",
      "settings",
      "menus",
      "pages",
      "articles",
      "categories",
      "forms",
      "templates",
      "callsigns",
    );

    await updateBackupJobProgress(String(job._id), {
      phase: "finalizing",
      message: `Restore completed from ${manifest.appVersion}`,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function processBackupJob(job: BackupJobDocument): Promise<void> {
  await connectDb();
  try {
    if (job.kind === "backup") {
      const built = await buildBackupArchive(job);
      try {
        await throwIfJobCancelled(String(job._id));
        const archiveInfo = await stat(built.filePath);
        const artifactKey = buildBackupArtifactKey(built.fileName);
        const stored = await putBackupArtifactFile(
          artifactKey,
          built.filePath,
          "application/zip",
        );
        await markBackupJobSucceeded({
          id: String(job._id),
          artifactKey,
          artifactFileName: built.fileName,
          artifactContentType: "application/zip",
          artifactSize: stored.size || archiveInfo.size,
          message:
            built.manifest.missingMedia.length > 0
              ? `Completed with ${built.manifest.missingMedia.length} missing media file(s)`
              : "Backup ready",
        });

        const downloadUrl = `${getPublicBaseUrl()}/api/admin/backup/artifacts/${String(
          job._id,
        )}`;
        await sendBackupReadyEmail({
          to: job.requestedByEmail,
          downloadUrl,
          fileName: built.fileName,
          clientKey: `backup:${job.requestedByEmail}`,
        });
        await markBackupEmailSent(String(job._id));
        await cleanupBackupArtifacts();
      } finally {
        await rm(path.dirname(built.filePath), { recursive: true, force: true });
      }
      return;
    }

    await restoreBackupArchive(job);
    await throwIfJobCancelled(String(job._id));
    if (job.sourceArtifactKey) {
      try {
        await deleteBackupArtifact(job.sourceArtifactKey);
      } catch {
        // Best-effort cleanup only.
      }
    }
    await markBackupJobSucceeded({
      id: String(job._id),
      message: "Restore completed",
    });
    await cleanupBackupArtifacts();
  } catch (error) {
    if (error instanceof BackupJobCancelledError) {
      return;
    }
    await markBackupJobFailed(
      String(job._id),
      publicErrorMessage(error, "Backup job failed"),
    );
  }
}

export async function failStaleRunningBackupJobs(maxAgeMs = 6 * 60 * 60 * 1000) {
  await connectDb();
  const cutoff = new Date(Date.now() - maxAgeMs);
  await BackupJob.updateMany(
    {
      status: "running",
      updatedAt: { $lt: cutoff },
    },
    {
      $set: {
        status: "failed",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "failed",
        message: "Worker timed out",
        error: "Worker timed out",
      },
    },
  );
}
