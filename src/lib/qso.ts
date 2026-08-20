import type { QsoListItemDto } from "@/lib/account-types";
import { connectDb } from "@/lib/db";
import { QsoLog } from "@/models/QsoLog";
import { User } from "@/models/User";

type QsoDocLike = {
  _id: unknown;
  workedCallsign: string;
  qsoAt: Date;
  band: string;
  freqMhz?: number | null;
  mode: string;
  rstSent?: string;
  rstRcvd?: string;
  qso_sent?: boolean;
  qso_confirmed?: boolean;
  grid?: string;
  notes?: string;
};

export function toQsoListItemDto(doc: QsoDocLike): QsoListItemDto {
  return {
    id: String(doc._id),
    workedCallsign: doc.workedCallsign,
    qsoAt: doc.qsoAt.toISOString(),
    band: doc.band,
    freqMhz: doc.freqMhz ?? null,
    mode: doc.mode,
    rstSent: doc.rstSent ?? "59",
    rstRcvd: doc.rstRcvd ?? "59",
    qso_sent: doc.qso_sent ?? false,
    qso_confirmed: doc.qso_confirmed ?? false,
    grid: doc.grid ?? "",
    notes: doc.notes ?? "",
  };
}

export async function listUserQsos(
  userId: string,
  limit = 200,
): Promise<QsoListItemDto[]> {
  await connectDb();
  const docs = await QsoLog.find({ userId })
    .sort({ qsoAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((doc) => toQsoListItemDto(doc));
}

export async function countUserQsos(userId: string) {
  await connectDb();
  return QsoLog.countDocuments({ userId });
}

export async function requireUserCallsign(userId: string) {
  await connectDb();
  const user = await User.findById(userId).select("callsign").lean();
  const callsign = user?.callsign?.trim() ?? "";
  if (!callsign) {
    return { ok: false as const, error: "Set your callsign in Account before logging QSOs" };
  }
  return { ok: true as const, callsign };
}

export async function listQsosForExport(userId?: string) {
  await connectDb();
  const filter = userId ? { userId } : {};
  return QsoLog.find(filter).sort({ qsoAt: 1 }).lean();
}

