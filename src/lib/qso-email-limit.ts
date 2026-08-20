import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { QsoLog } from "@/models/QsoLog";

const DEFAULT_QSO_EMAIL_LIMIT = 20;

export function getQsoEmailLimit(): number {
  const raw = process.env.QSO_EMAIL_LIMIT?.trim();
  if (!raw) return DEFAULT_QSO_EMAIL_LIMIT;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_QSO_EMAIL_LIMIT;
  }
  return parsed;
}

export async function countQsoConfirmationEmailsSent(
  userId: string,
): Promise<number> {
  await connectDb();
  return QsoLog.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    confirmationSentAt: { $ne: null },
  });
}

export async function checkQsoEmailLimit(userId: string): Promise<
  | { ok: true }
  | { ok: false; reason: "limit_reached"; limit: number; count: number }
> {
  const limit = getQsoEmailLimit();
  const count = await countQsoConfirmationEmailsSent(userId);

  if (count >= limit) {
    return { ok: false, reason: "limit_reached", limit, count };
  }

  return { ok: true };
}
