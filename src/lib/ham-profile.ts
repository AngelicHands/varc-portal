import type { ProfileGender } from "@/lib/account-types";
import { connectDb } from "@/lib/db";
import { normalizeCallsignQuery } from "@/lib/callsigns-normalize";
import { isReservedHamPath } from "@/lib/ham-reserved";
import { getPublicBaseUrl } from "@/lib/public-url";
import { Callsign } from "@/models/Callsign";
import { User, type UserDocument } from "@/models/User";
import type { Types } from "mongoose";

export type PublicHamProfile = {
  id: string;
  callsign: string;
  name: string;
  image: string | null;
  callsignVerified: boolean;
  isProfilePublic: boolean;
  isQsoPublic: boolean;
  birthday: string | null;
  gender: ProfileGender;
  archiveExists: boolean;
};

const globalForHamIndex = globalThis as unknown as {
  hamCallsignIndexPromise?: Promise<void>;
};

export function hamPublicPath(sign: string): string {
  return `/${normalizeCallsignQuery(sign)}`;
}

export function hamPublicUrl(sign: string): string {
  return `${getPublicBaseUrl()}${hamPublicPath(sign)}`;
}

export async function findUserByAssignedCallsign(
  sign: string,
  exceptUserId?: Types.ObjectId | string,
) {
  const callsign = normalizeCallsignQuery(sign);
  if (!callsign) return null;
  const query: Record<string, unknown> = { callsign };
  if (exceptUserId) {
    query._id = { $ne: exceptUserId };
  }
  return User.findOne(query).select("_id").lean();
}

export async function findPublicHamByCallsign(
  rawSign: string,
): Promise<PublicHamProfile | null> {
  const callsign = normalizeCallsignQuery(rawSign);
  if (!callsign || isReservedHamPath(callsign)) return null;

  await connectDb();
  await ensureUserCallsignIndex();

  const [user, archive] = await Promise.all([
    User.findOne({ callsign })
      .select(
        "_id name image callsign callsignVerified isProfilePublic isQsoPublic birthday gender",
      )
      .lean<
        Pick<
          UserDocument,
          | "_id"
          | "name"
          | "image"
          | "callsign"
          | "callsignVerified"
          | "isProfilePublic"
          | "isQsoPublic"
          | "birthday"
          | "gender"
        > | null
      >(),
    Callsign.exists({ sign: callsign }),
  ]);

  if (!user?.callsign) return null;

  return {
    id: String(user._id),
    callsign: user.callsign,
    name: user.name,
    image: user.image ?? null,
    callsignVerified: Boolean(user.callsignVerified),
    isProfilePublic: user.isProfilePublic !== false,
    isQsoPublic: Boolean(user.isQsoPublic),
    birthday: user.birthday
      ? (() => {
          const date = new Date(user.birthday);
          if (Number.isNaN(date.getTime())) return null;
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, "0");
          const day = String(date.getUTCDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        })()
      : null,
    gender:
      user.gender === "male" || user.gender === "female" || user.gender === "other"
        ? user.gender
        : "",
    archiveExists: Boolean(archive),
  };
}

export async function listHamsForSitemap(): Promise<
  { sign: string; updatedAt: Date }[]
> {
  await connectDb();
  const rows = await User.find(
    { callsign: { $gt: "" } },
    { callsign: 1, updatedAt: 1 },
  )
    .sort({ callsign: 1 })
    .lean<{ callsign: string; updatedAt?: Date }[]>();

  return rows
    .filter((row) => row.callsign && !isReservedHamPath(row.callsign))
    .map((row) => ({
      sign: row.callsign,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    }));
}

export async function ensureUserCallsignIndex() {
  if (!globalForHamIndex.hamCallsignIndexPromise) {
    globalForHamIndex.hamCallsignIndexPromise = (async () => {
      await connectDb();
      await reconcileDuplicateUserCallsigns();
      const indexes = await User.collection.indexes();
      const callsignIdx = indexes.find(
        (idx) => idx.key.callsign === 1 && Object.keys(idx.key).length === 1,
      );
      const isUniquePartial =
        Boolean(callsignIdx?.unique) &&
        Boolean(
          callsignIdx?.partialFilterExpression &&
            typeof callsignIdx.partialFilterExpression === "object" &&
            "callsign" in callsignIdx.partialFilterExpression,
        );
      if (callsignIdx?.name && !isUniquePartial) {
        await User.collection.dropIndex(callsignIdx.name);
      }
      await User.syncIndexes();
    })().catch((error) => {
      globalForHamIndex.hamCallsignIndexPromise = undefined;
      throw error;
    });
  }
  return globalForHamIndex.hamCallsignIndexPromise;
}

type DupRow = {
  _id: string;
  ids: { id: Types.ObjectId; verified: boolean; createdAt: Date }[];
};

async function reconcileDuplicateUserCallsigns() {
  const groups = await User.aggregate<DupRow>([
    { $match: { callsign: { $gt: "" } } },
    {
      $group: {
        _id: "$callsign",
        n: { $sum: 1 },
        ids: {
          $push: {
            id: "$_id",
            verified: { $eq: ["$callsignVerified", true] },
            createdAt: "$createdAt",
          },
        },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]);

  for (const group of groups) {
    const sorted = [...group.ids].sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const extras = sorted.slice(1).map((row) => row.id);
    if (extras.length === 0) continue;
    await User.updateMany(
      { _id: { $in: extras } },
      { $set: { callsign: "", callsignVerified: false } },
    );
  }
}
