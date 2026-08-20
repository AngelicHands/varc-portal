import { createHash, randomBytes } from "crypto";
import { connectDb } from "@/lib/db";
import { createEmailJob } from "@/lib/mail/jobs";
import { buildQsoConfirmationEmail } from "@/lib/mail/qso-confirmation-email";
import { formatQsoDateTime } from "@/lib/qso-datetime";
import { checkQsoEmailLimit } from "@/lib/qso-email-limit";
import { getPublicBaseUrl } from "@/lib/public-url";
import { logServerError } from "@/lib/safe-error";
import { normalizeProfileCallsign } from "@/lib/validations/qso";
import { QsoLog } from "@/models/QsoLog";
import { User } from "@/models/User";

const CONFIRMATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function generateConfirmationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashConfirmationToken(token) };
}

export async function findUserByCallsign(callsign: string) {
  await connectDb();
  const normalized = normalizeProfileCallsign(callsign);
  if (!normalized) return null;
  return User.findOne({ callsign: normalized })
    .select("_id email name callsign")
    .lean();
}

export async function enqueueQsoConfirmationRequest(params: {
  qsoId: string;
  loggerUserId: string;
  stationCallsign: string;
  workedCallsign: string;
  qsoAt: string;
  band: string;
  mode: string;
  clientKey?: string;
  bypassEmailLimit?: boolean;
}): Promise<
  | { ok: true }
  | { ok: false; reason: string; limit?: number; count?: number }
> {
  try {
    await connectDb();

    if (!params.bypassEmailLimit) {
      const limitCheck = await checkQsoEmailLimit(params.loggerUserId);
      if (!limitCheck.ok) {
        return {
          ok: false,
          reason: "limit_reached",
          limit: limitCheck.limit,
          count: limitCheck.count,
        };
      }
    }

    const recipient = await findUserByCallsign(params.workedCallsign);
    if (!recipient?.email?.trim()) {
      return { ok: false, reason: "no_matching_account" };
    }
    if (String(recipient._id) === params.loggerUserId) {
      return { ok: false, reason: "self_qso" };
    }

    const { token, hash } = generateConfirmationToken();
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);

    const updated = await QsoLog.findOneAndUpdate(
      {
        _id: params.qsoId,
        userId: params.loggerUserId,
        qso_confirmed: false,
      },
      {
        $set: {
          confirmationTokenHash: hash,
          confirmationExpiresAt: expiresAt,
          confirmationSentAt: new Date(),
          confirmationRecipientUserId: recipient._id,
        },
      },
      { new: true },
    );
    if (!updated) {
      return { ok: false, reason: "qso_not_found" };
    }

    const confirmUrl = `${getPublicBaseUrl()}/api/qso/confirm/${token}`;
    const message = buildQsoConfirmationEmail({
      recipientName:
        recipient.name?.trim() || recipient.callsign || recipient.email,
      stationCallsign: params.stationCallsign,
      workedCallsign: params.workedCallsign,
      qsoAtDisplay: formatQsoDateTime(params.qsoAt),
      band: params.band,
      mode: params.mode,
      confirmUrl,
    });

    await createEmailJob({
      kind: "qso_confirmation",
      to: recipient.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      clientKey: params.clientKey,
      relatedId: params.qsoId,
    });

    return { ok: true };
  } catch (error) {
    logServerError("qso-confirmation-enqueue", error);
    return { ok: false, reason: "enqueue_failed" };
  }
}

export async function confirmQsoByToken(token: string): Promise<
  | { ok: true; qsoId: string }
  | { ok: false; error: "invalid" | "expired" | "already_confirmed" }
> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "invalid" };

  await connectDb();
  const hash = hashConfirmationToken(trimmed);
  const qso = await QsoLog.findOne({ confirmationTokenHash: hash });
  if (!qso) return { ok: false, error: "invalid" };
  if (qso.qso_confirmed) return { ok: false, error: "already_confirmed" };
  if (
    qso.confirmationExpiresAt &&
    qso.confirmationExpiresAt.getTime() < Date.now()
  ) {
    return { ok: false, error: "expired" };
  }

  qso.qso_confirmed = true;
  qso.confirmedAt = new Date();
  qso.confirmationTokenHash = "";
  qso.confirmationExpiresAt = null;
  await qso.save();

  return { ok: true, qsoId: String(qso._id) };
}
