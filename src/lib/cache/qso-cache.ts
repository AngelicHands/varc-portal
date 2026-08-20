import { getValkey } from "@/lib/cache/valkey";
import { logServerError } from "@/lib/safe-error";

export const HAM_PUBLIC_CACHE_TTL_SEC = 600;
export const QSO_LIST_CACHE_TTL_SEC = 300;
export const QSO_COUNT_CACHE_TTL_SEC = 300;

const USER_TAG_PREFIX = "qso:tag:user:";
const HAM_TAG_PREFIX = "qso:tag:ham:";

export const QsoCacheKeys = {
  hamPublic: (callsign: string) => `ham:public:${callsign}:v1`,
  qsoList: (userId: string, limit?: number) =>
    `qso:list:user:${userId}:limit:${limit != null && limit > 0 ? limit : "all"}:v1`,
  qsoListPage: (
    userId: string,
    page: number,
    pageSize: number,
    queryHash: string,
    sortKey: string,
    sortDir: string,
  ) =>
    `qso:list:user:${userId}:p${page}:s${pageSize}:q${queryHash}:sort${sortKey}:${sortDir}:v2`,
  qsoCount: (userId: string) => `qso:count:user:${userId}:v1`,
};

function userTag(userId: string): string {
  return `${USER_TAG_PREFIX}${userId}`;
}

function hamTag(callsign: string): string {
  return `${HAM_TAG_PREFIX}${callsign}`;
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.filter(Boolean))];
}

async function tagKeyMembers(tag: string): Promise<string[]> {
  const client = await getValkey();
  if (!client) return [];
  try {
    return await client.sMembers(tag);
  } catch (error) {
    logServerError("valkey read qso tag", error);
    return [];
  }
}

export async function qsoCacheAside<T>(
  key: string,
  tags: string[],
  loader: () => Promise<T>,
  ttlSec: number,
): Promise<T> {
  const client = await getValkey();
  if (client) {
    try {
      const hit = await client.get(key);
      if (hit != null) {
        return JSON.parse(hit) as T;
      }
    } catch (error) {
      logServerError("valkey get qso cache", error);
    }
  }

  const value = await loader();

  if (client) {
    try {
      const payload = JSON.stringify(value);
      const multi = client.multi();
      multi.set(key, payload, { EX: ttlSec });
      for (const tag of uniqueTags(tags)) {
        multi.sAdd(tag, key);
        multi.expire(tag, ttlSec + 60);
      }
      await multi.exec();
    } catch (error) {
      logServerError("valkey set qso cache", error);
    }
  }

  return value;
}

export async function invalidateQsoUserCache(userId: string): Promise<void> {
  const client = await getValkey();
  if (!client) return;
  const tag = userTag(userId);
  try {
    const members = await tagKeyMembers(tag);
    const keys = members.length > 0 ? [...members, tag] : [tag];
    await client.del(keys);
  } catch (error) {
    logServerError("valkey invalidate qso user cache", error);
  }
}

export async function invalidateHamPublicCache(callsign: string): Promise<void> {
  const normalized = callsign.trim().toUpperCase();
  if (!normalized) return;
  const client = await getValkey();
  if (!client) return;
  const tag = hamTag(normalized);
  try {
    const members = await tagKeyMembers(tag);
    const keys = members.length > 0 ? [...members, tag] : [tag];
    await client.del(keys);
  } catch (error) {
    logServerError("valkey invalidate ham cache", error);
  }
}

export async function invalidateQsoAndHamCache(params: {
  userId?: string;
  callsigns?: string[];
}): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (params.userId) {
    tasks.push(invalidateQsoUserCache(params.userId));
  }
  for (const callsign of uniqueTags((params.callsigns ?? []).map((item) => item.trim().toUpperCase()))) {
    tasks.push(invalidateHamPublicCache(callsign));
  }
  await Promise.all(tasks);
}

export const QsoCacheTags = {
  user: userTag,
  ham: hamTag,
};
