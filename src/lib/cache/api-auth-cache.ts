import { getValkey } from "@/lib/cache/valkey";
import { logServerError } from "@/lib/safe-error";

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
