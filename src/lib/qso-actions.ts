"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectDb } from "@/lib/db";
import { enqueueQsoConfirmationRequest } from "@/lib/qso-confirmation";
import { getQsoEmailLimit } from "@/lib/qso-email-limit";
import { requireUserCallsign, toQsoListItemDto } from "@/lib/qso";
import { isAdminRole } from "@/lib/roles";
import { failAction } from "@/lib/safe-error";
import { qsoInputSchema } from "@/lib/validations/qso";
import { QsoLog } from "@/models/QsoLog";

async function requireLogbookSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session;
}

function revalidateLogbook(callsign: string) {
  revalidatePath("/logbook");
  if (!callsign) return;
  revalidatePath(`/${callsign}`);
  revalidatePath(`/vi/${callsign}`);
  revalidatePath(`/en/${callsign}`);
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
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to delete QSO");
  }
}
