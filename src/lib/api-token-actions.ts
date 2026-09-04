"use server";

import mongoose from "mongoose";
import { auth } from "@/auth";
import {
  availableApiTokenScopes,
  defaultApiTokenScopes,
  generateApiToken,
  getApiPublicUrl,
  MAX_API_TOKENS_PER_USER,
  resolveApiTokenScopes,
  type ApiTokenScope,
} from "@/lib/api-token";
import { connectDb } from "@/lib/db";
import { invalidateApiAuthCache } from "@/lib/cache/api-auth-cache";
import { failAction } from "@/lib/safe-error";
import { ApiToken } from "@/models/ApiToken";
import { User } from "@/models/User";

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
    const dbUser = await User.findById(userId).select("role").lean();
    if (!dbUser) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const docs = await ApiToken.find({
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    const availableScopes = availableApiTokenScopes(dbUser.role);
    const defaultScopes = defaultApiTokenScopes(dbUser.role);

    return {
      ok: true as const,
      tokens: docs.map((doc) => toListItem(doc)),
      apiPublicUrl: getApiPublicUrl(),
      availableScopes,
      defaultScopes,
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
        ? (raw as {
            name?: unknown;
            expiresAt?: unknown;
            scopes?: unknown;
          })
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
    const dbUser = await User.findById(userId).select("role").lean();
    if (!dbUser) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const requestedScopes =
      body.scopes === undefined
        ? defaultApiTokenScopes(dbUser.role)
        : resolveApiTokenScopes(dbUser.role, body.scopes);
    if (!requestedScopes) {
      return {
        ok: false as const,
        error: "Select at least one permission you are allowed to grant",
      };
    }
    const scopes: ApiTokenScope[] = requestedScopes;

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
      scopes,
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

export async function updateApiTokenScopesAction(raw: unknown) {
  try {
    const userId = await requireSessionUserId();
    if (!userId) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const body =
      raw && typeof raw === "object"
        ? (raw as { id?: unknown; scopes?: unknown })
        : {};
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false as const, error: "Not found" };
    }

    await connectDb();
    const dbUser = await User.findById(userId).select("role").lean();
    if (!dbUser) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const scopes = resolveApiTokenScopes(dbUser.role, body.scopes);
    if (!scopes) {
      return {
        ok: false as const,
        error: "Select at least one permission you are allowed to grant",
      };
    }

    const updated = await ApiToken.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        userId: new mongoose.Types.ObjectId(userId),
        revokedAt: null,
      },
      { $set: { scopes } },
      { new: true },
    ).lean();

    if (!updated) {
      return { ok: false as const, error: "Not found" };
    }

    await invalidateApiAuthCache({
      tokenId: String(updated._id),
      tokenPrefix: updated.tokenPrefix,
    });

    return {
      ok: true as const,
      tokenItem: toListItem(updated),
    };
  } catch (error) {
    return failAction(error, "Failed to update API token permissions");
  }
}

export async function regenerateApiTokenAction(id: string) {
  try {
    const userId = await requireSessionUserId();
    if (!userId) {
      return { ok: false as const, error: "Unauthorized" };
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false as const, error: "Not found" };
    }

    await connectDb();
    const existing = await ApiToken.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
    }).lean();

    if (!existing) {
      return { ok: false as const, error: "Not found" };
    }

    const previousPrefix = existing.tokenPrefix;
    const { token, prefix, hash } = generateApiToken();
    const updated = await ApiToken.findOneAndUpdate(
      {
        _id: existing._id,
        userId: new mongoose.Types.ObjectId(userId),
        revokedAt: null,
      },
      {
        $set: {
          tokenPrefix: prefix,
          tokenHash: hash,
          lastUsedAt: null,
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return { ok: false as const, error: "Not found" };
    }

    // Invalidate both old and new prefix keys so the previous secret stops immediately.
    await invalidateApiAuthCache({
      tokenId: String(existing._id),
      tokenPrefix: previousPrefix,
    });
    await invalidateApiAuthCache({
      tokenId: String(updated._id),
      tokenPrefix: updated.tokenPrefix,
    });

    return {
      ok: true as const,
      token,
      tokenItem: toListItem(updated),
    };
  } catch (error) {
    return failAction(error, "Failed to regenerate API token");
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
