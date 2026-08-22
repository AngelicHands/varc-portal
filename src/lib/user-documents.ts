import { randomUUID } from "node:crypto";
import path from "node:path";
import { connectDb } from "@/lib/db";
import {
  deleteObject,
  putObject,
  publicUrlForObjectKey,
} from "@/lib/media/storage";
import type { UserDocumentDto } from "@/lib/account-types";
import type { UserDocumentKind } from "@/lib/validations/qso";
import { User } from "@/models/User";
import { UserDocumentModel } from "@/models/UserDocument";

export type { UserDocumentDto };

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const trimmed = base.replace(/^-+|-+$/g, "").slice(0, 80);
  return trimmed || "file";
}

export function buildUserDocumentKey(
  userId: string,
  kind: UserDocumentKind,
  originalName: string,
): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  return `user-documents/${userId}/${kind}/${id}-${sanitizeFileName(originalName)}`;
}

export async function listUserDocuments(userId: string): Promise<UserDocumentDto[]> {
  await connectDb();
  const docs = await UserDocumentModel.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
  return docs.map((doc) => ({
    id: String(doc._id),
    kind: doc.kind as UserDocumentKind,
    originalName: doc.originalName,
    contentType: doc.contentType,
    size: doc.size,
    createdAt: doc.createdAt.toISOString(),
    downloadUrl: `/api/account/documents/${String(doc._id)}/download`,
  }));
}

export async function saveUserDocument(input: {
  userId: string;
  kind: UserDocumentKind;
  uploadedByUserId: string;
  file: File;
}) {
  const key = buildUserDocumentKey(input.userId, input.kind, input.file.name);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const stored = await putObject(key, buffer, input.file.type || "application/octet-stream");

  await connectDb();
  const doc = await UserDocumentModel.create({
    userId: input.userId,
    kind: input.kind,
    key: stored.key,
    url: stored.url,
    originalName: input.file.name,
    contentType: stored.contentType,
    size: stored.size,
    uploadedByUserId: input.uploadedByUserId,
  });

  return {
    id: String(doc._id),
    kind: doc.kind as UserDocumentKind,
    originalName: doc.originalName,
    contentType: doc.contentType,
    size: doc.size,
    createdAt: doc.createdAt.toISOString(),
    downloadUrl: `/api/account/documents/${String(doc._id)}/download`,
  };
}

export async function deleteUserDocumentForUser(
  documentId: string,
  userId: string,
): Promise<boolean> {
  await connectDb();
  const doc = await UserDocumentModel.findOne({ _id: documentId, userId });
  if (!doc) return false;
  await deleteObject(doc.key);
  await doc.deleteOne();
  return true;
}

export async function getUserDocumentById(documentId: string) {
  await connectDb();
  return UserDocumentModel.findById(documentId).lean();
}

export async function userAllowsPublicDocumentAccess(userId: string): Promise<boolean> {
  await connectDb();
  const user = await User.findById(userId)
    .select("isProfilePublic isDocumentsPublic")
    .lean();
  return Boolean(user?.isProfilePublic && user?.isDocumentsPublic);
}

export function adminDocumentDownloadUrl(documentId: string): string {
  return `/api/account/documents/${documentId}/download`;
}

export { publicUrlForObjectKey };
