"use server";

import { headers } from "next/headers";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { invalidateQsoAndHamCache } from "@/lib/cache/qso-cache";
import { connectDb } from "@/lib/db";
import { enqueueQsoConfirmationRequest } from "@/lib/qso-confirmation";
import { getQsoEmailLimit } from "@/lib/qso-email-limit";
import { requireUserCallsign, listUserQsosPage, toQsoListItemDto } from "@/lib/qso";
import { revalidateLogbook } from "@/lib/qso-revalidate";
import { canViewHamLogbook } from "@/lib/ham-privacy";
import { canManageUsers, isAdminRole } from "@/lib/roles";
import { failAction } from "@/lib/safe-error";
import { qsoInputSchema } from "@/lib/validations/qso";
import { QsoLog } from "@/models/QsoLog";
import { User } from "@/models/User";

async function requireLogbookSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session;
}

async function requireUserManager() {
  const session = await requireLogbookSession();
  if (!session || !canManageUsers(session.user)) {
    return null;
  }
  return session;
}

async function callsignForUser(userId: string): Promise<string> {
  const user = await User.findById(userId).select("callsign").lean();
  return user?.callsign?.trim() ?? "";
}

function clientKeyFromHeaders(headerStore: Headers): string {
  const forwarded = headerStore.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `qso-confirm:${ip}`;
}

export async function createQsoAction(raw: unknown) {
  try {
    const session = await requireLogbookSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const parsed = qsoInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid QSO data",
      };
    }

    await connectDb();
    const callsignCheck = await requireUserCallsign(session.user.id);
    if (!callsignCheck.ok) return callsignCheck;

    const created = await QsoLog.create({
      userId: new mongoose.Types.ObjectId(session.user.id),
      ...parsed.data,
      qso_confirmed: false,
      source: "portal",
    });

    let emailSkipped = false;
    if (parsed.data.qso_sent) {
      const headerStore = await headers();
      const enqueueResult = await enqueueQsoConfirmationRequest({
        qsoId: String(created._id),
        loggerUserId: session.user.id,
        stationCallsign: callsignCheck.callsign,
        workedCallsign: parsed.data.workedCallsign,
        qsoAt: parsed.data.qsoAt,
        band: parsed.data.band,
        mode: parsed.data.mode,
        clientKey: clientKeyFromHeaders(headerStore),
        bypassEmailLimit: isAdminRole(session.user),
      });
      if (!enqueueResult.ok && enqueueResult.reason === "limit_reached") {
        emailSkipped = true;
      }
    }

    revalidateLogbook(callsignCheck.callsign);
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: [callsignCheck.callsign],
    });
    const qso = toQsoListItemDto(created);
    if (emailSkipped) {
      return {
        ok: true as const,
        qso,
        warning: {
          code: "email_limit_reached" as const,
          limit: getQsoEmailLimit(),
        },
      };
    }
    return { ok: true as const, qso };
  } catch (error) {
    return failAction(error, "Failed to create QSO");
  }
}

export async function updateQsoAction(id: string, raw: unknown) {
  try {
    const session = await requireLogbookSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const parsed = qsoInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid QSO data",
      };
    }

    await connectDb();
    const existing = await QsoLog.findById(id);
    if (!existing || String(existing.userId) !== session.user.id) {
      return { ok: false as const, error: "Not found" };
    }

    const wasSent = existing.qso_sent;
    existing.workedCallsign = parsed.data.workedCallsign;
    existing.qsoAt = new Date(parsed.data.qsoAt);
    existing.band = parsed.data.band;
    existing.freqMhz = parsed.data.freqMhz;
    existing.mode = parsed.data.mode;
    existing.rstSent = parsed.data.rstSent;
    existing.rstRcvd = parsed.data.rstRcvd;
    existing.qso_sent = parsed.data.qso_sent;
    existing.grid = parsed.data.grid;
    existing.notes = parsed.data.notes;
    await existing.save();

    const callsignCheck = await requireUserCallsign(session.user.id);

    let emailSkipped = false;
    if (parsed.data.qso_sent && !wasSent && !existing.qso_confirmed) {
      if (callsignCheck.ok) {
        const headerStore = await headers();
        const enqueueResult = await enqueueQsoConfirmationRequest({
          qsoId: String(existing._id),
          loggerUserId: session.user.id,
          stationCallsign: callsignCheck.callsign,
          workedCallsign: parsed.data.workedCallsign,
          qsoAt: parsed.data.qsoAt,
          band: parsed.data.band,
          mode: parsed.data.mode,
          clientKey: clientKeyFromHeaders(headerStore),
          bypassEmailLimit: isAdminRole(session.user),
        });
        if (!enqueueResult.ok && enqueueResult.reason === "limit_reached") {
          emailSkipped = true;
        }
      }
    }

    revalidateLogbook(callsignCheck.ok ? callsignCheck.callsign : "");
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: callsignCheck.ok ? [callsignCheck.callsign] : [],
    });
    const qso = toQsoListItemDto(existing);
    if (emailSkipped) {
      return {
        ok: true as const,
        qso,
        warning: {
          code: "email_limit_reached" as const,
          limit: getQsoEmailLimit(),
        },
      };
    }
    return { ok: true as const, qso };
  } catch (error) {
    return failAction(error, "Failed to update QSO");
  }
}

export async function deleteQsoAction(id: string) {
  try {
    const session = await requireLogbookSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    await connectDb();
    const result = await QsoLog.deleteOne({
      _id: id,
      userId: session.user.id,
    });
    if (result.deletedCount === 0) {
      return { ok: false as const, error: "Not found" };
    }

    const callsignCheck = await requireUserCallsign(session.user.id);
    revalidateLogbook(callsignCheck.ok ? callsignCheck.callsign : "");
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: callsignCheck.ok ? [callsignCheck.callsign] : [],
    });
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to delete QSO");
  }
}

export async function adminDeleteQsoAction(id: string, userId: string) {
  try {
    const session = await requireUserManager();
    if (!session) {
      return { ok: false as const, error: "Forbidden" };
    }

    await connectDb();
    const result = await QsoLog.deleteOne({
      _id: id,
      userId,
    });
    if (result.deletedCount === 0) {
      return { ok: false as const, error: "Not found" };
    }

    const callsign = await callsignForUser(userId);
    revalidateLogbook(callsign);
    await invalidateQsoAndHamCache({
      userId,
      callsigns: callsign ? [callsign] : [],
    });
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to delete QSO");
  }
}

export async function deleteAllUserQsosAction(userId: string) {
  try {
    const session = await requireLogbookSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }
    if (session.user.id !== userId && !canManageUsers(session.user)) {
      return { ok: false as const, error: "Forbidden" };
    }

    await connectDb();
    const callsign = await callsignForUser(userId);
    const result = await QsoLog.deleteMany({ userId });
    revalidateLogbook(callsign);
    await invalidateQsoAndHamCache({
      userId,
      callsigns: callsign ? [callsign] : [],
    });
    return { ok: true as const, deleted: result.deletedCount ?? 0 };
  } catch (error) {
    return failAction(error, "Failed to delete logbook");
  }
}

/** Paginated logbook read for the profile tab (client-fetched after tab paint). */
export async function loadQsoLogbookPageAction(input: {
  userId: string;
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  sortKey?: string;
  sortDir?: string;
}) {
  try {
    const userId = input.userId?.trim();
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return { ok: false as const, error: "Invalid user" };
    }

    const session = await auth();
    await connectDb();
    const owner = await User.findById(userId)
      .select("isQsoPublic isProfilePublic")
      .lean();
    if (!owner) {
      return { ok: false as const, error: "Not found" };
    }

    const isOwner = session?.user?.id === userId;
    const isManager = Boolean(session?.user && canManageUsers(session.user));
    if (
      !canViewHamLogbook(
        {
          isProfilePublic: owner.isProfilePublic !== false,
          isQsoPublic: Boolean(owner.isQsoPublic),
        },
        { canEdit: isOwner, canAdminManage: isManager },
      )
    ) {
      return { ok: false as const, error: "Forbidden" };
    }

    const page = await listUserQsosPage({
      userId,
      page: input.page,
      pageSize: input.pageSize,
      search: input.search,
      sortKey: input.sortKey,
      sortDir: input.sortDir,
    });

    return { ok: true as const, page };
  } catch (error) {
    return failAction(error, "Failed to load logbook");
  }
}
