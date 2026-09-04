import mongoose from "mongoose";
import { getValkey } from "@/lib/cache/valkey";
import { connectDb } from "@/lib/db";
import { logServerError } from "@/lib/safe-error";
import { ApiToken } from "@/models/ApiToken";

const AUTH_TOKEN_KEY_PREFIX = "api:auth:token:";
const AUTH_PREFIX_KEY_PREFIX = "api:auth:prefix:";

export async function invalidateApiAuthCache(params: {
  tokenId: string;
  tokenPrefix: string;
}): Promise<void> {
  const client = await getValkey();
  if (!client) return;

  const keys: string[] = [];
  if (params.tokenId.trim()) {
    keys.push(`${AUTH_TOKEN_KEY_PREFIX}${params.tokenId.trim()}`);
  }
  if (params.tokenPrefix.trim()) {
    keys.push(`${AUTH_PREFIX_KEY_PREFIX}${params.tokenPrefix.trim()}`);
  }
  if (keys.length === 0) return;

  try {
    await client.del(keys);
  } catch (error) {
    logServerError("valkey invalidate api auth cache", error);
  }
}

/** Bust auth cache for every active token owned by a user (e.g. after role change). */
export async function invalidateApiAuthCacheForUser(
  userId: string,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;

  await connectDb();
  const tokens = await ApiToken.find({
    userId: new mongoose.Types.ObjectId(userId),
    revokedAt: null,
  })
    .select({ _id: 1, tokenPrefix: 1 })
    .lean();

  await Promise.all(
    tokens.map((token) =>
      invalidateApiAuthCache({
        tokenId: String(token._id),
        tokenPrefix: token.tokenPrefix,
      }),
    ),
  );
}
