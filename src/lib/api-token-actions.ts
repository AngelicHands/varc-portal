"use server";

import mongoose from "mongoose";
import { auth } from "@/auth";
import {
  generateApiToken,
  getApiPublicUrl,
  MAX_API_TOKENS_PER_USER,
} from "@/lib/api-token";
import { connectDb } from "@/lib/db";
import { invalidateApiAuthCache } from "@/lib/cache/api-auth-cache";
import { failAction } from "@/lib/safe-error";
import { ApiToken } from "@/models/ApiToken";

export type ApiTokenListItemDto = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

async function requireSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function toListItem(doc: {
  _id: mongoose.Types.ObjectId;
  name: string;
  tokenPrefix: string;
  scopes?: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt?: Date;
}): ApiTokenListItemDto {
  return {
    id: String(doc._id),
    name: doc.name,
    tokenPrefix: doc.tokenPrefix,
    scopes: doc.scopes ?? [],
    expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listApiTokensAction() {
  try {
    const userId = await requireSessionUserId();
    if (!userId) {
      return { ok: false as const, error: "Unauthorized" };
    }

    await connectDb();
    const docs = await ApiToken.find({
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    return {
      ok: true as const,
      tokens: docs.map((doc) => toListItem(doc)),
      apiPublicUrl: getApiPublicUrl(),
    };
  } catch (error) {
    return failAction(error, "Failed to load API tokens");
  }
}

export async function createApiTokenAction(raw: unknown) {
  try {
    const userId = await requireSessionUserId();
    if (!userId) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const body =
      raw && typeof raw === "object"
        ? (raw as { name?: unknown; expiresAt?: unknown })
        : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return { ok: false as const, error: "Enter a token name" };
    }

    let expiresAt: Date | null = null;
    if (typeof body.expiresAt === "string" && body.expiresAt.trim()) {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        return { ok: false as const, error: "Expiry must be in the future" };
      }
      expiresAt = parsed;
    }

    await connectDb();
    const activeCount = await ApiToken.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
    });
    if (activeCount >= MAX_API_TOKENS_PER_USER) {
      return {
        ok: false as const,
        error: `You can have at most ${MAX_API_TOKENS_PER_USER} active API tokens`,
      };
    }

    const { token, prefix, hash } = generateApiToken();
    const created = await ApiToken.create({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      tokenPrefix: prefix,
      tokenHash: hash,
      expiresAt,
    });

    return {
      ok: true as const,
      token,
      tokenItem: toListItem(created),
      apiPublicUrl: getApiPublicUrl(),
    };
  } catch (error) {
    return failAction(error, "Failed to create API token");
  }
}

export async function revokeApiTokenAction(id: string) {
  try {
    const userId = await requireSessionUserId();
    if (!userId) {
      return { ok: false as const, error: "Unauthorized" };
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false as const, error: "Not found" };
    }

    await connectDb();
    const updated = await ApiToken.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        userId: new mongoose.Types.ObjectId(userId),
        revokedAt: null,
      },
      { revokedAt: new Date() },
      { new: true },
    ).lean();

    if (!updated) {
      return { ok: false as const, error: "Not found" };
    }

    await invalidateApiAuthCache({
      tokenId: String(updated._id),
      tokenPrefix: updated.tokenPrefix,
    });

    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to revoke API token");
  }
}
