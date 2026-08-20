"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { invalidateQsoAndHamCache } from "@/lib/cache/qso-cache";
import { connectDb } from "@/lib/db";
import {
  ensureUserCallsignIndex,
  findUserByAssignedCallsign,
} from "@/lib/ham-profile";
import { createEmailJob } from "@/lib/mail/jobs";
import { buildCallsignVerificationRequestEmail } from "@/lib/mail/callsign-verification-email";
import { failAction } from "@/lib/safe-error";
import { getAccountProfile } from "@/lib/account";
import { listUserDocuments } from "@/lib/user-documents";
import { profileFormSchema, homeLocationUpdateSchema } from "@/lib/validations/qso";
import { User } from "@/models/User";

async function requireAccountSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session;
}

function revalidateUserCallsignPaths(callsign: string) {
  if (!callsign) return;
  revalidatePath(`/${callsign}`);
  revalidatePath(`/vi/${callsign}`);
  revalidatePath(`/en/${callsign}`);
}

export async function updateProfileAction(raw: unknown) {
  try {
    const session = await requireAccountSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const parsed = profileFormSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid profile data",
      };
    }

    await connectDb();
    await ensureUserCallsignIndex();
    const user = await User.findById(session.user.id);
    if (!user) {
      return { ok: false as const, error: "User not found" };
    }

    const previousCallsign = (user.callsign?.trim() ?? "").toUpperCase();
    const nextCallsign = parsed.data.callsign;
    const callsignChanged = nextCallsign !== previousCallsign;

    if (nextCallsign) {
      const taken = await findUserByAssignedCallsign(nextCallsign, user._id);
      if (taken) {
        return {
          ok: false as const,
          error: "Callsign is already assigned to another user",
        };
      }
    }

    const birthdayIso = parsed.data.birthday;
    const homeGrid = parsed.data.homeGrid;
    const hasLocation =
      Boolean(homeGrid) &&
      typeof parsed.data.homeLat === "number" &&
      typeof parsed.data.homeLng === "number";
    const update: Record<string, unknown> = {
      name: parsed.data.name,
      callsign: nextCallsign,
      gender: parsed.data.gender,
      homeGrid,
      homeLat: hasLocation ? parsed.data.homeLat : null,
      homeLng: hasLocation ? parsed.data.homeLng : null,
      callsignVerified:
        Boolean(nextCallsign) &&
        !callsignChanged &&
        Boolean(user.callsignVerified),
      callsignVerificationStatus:
        Boolean(nextCallsign) && !callsignChanged && Boolean(user.callsignVerified)
          ? "verified"
          : "unverified",
    };
    if (birthdayIso) {
      update.birthday = new Date(`${birthdayIso}T12:00:00.000Z`);
    }

    await User.updateOne(
      { _id: user._id },
      birthdayIso
        ? { $set: update }
        : { $set: update, $unset: { birthday: 1 } },
      { strict: false },
    );

    revalidatePath("/account");
    revalidatePath("/logbook");
    revalidateUserCallsignPaths(previousCallsign);
    revalidateUserCallsignPaths(nextCallsign);
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: [previousCallsign, nextCallsign],
    });
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to update profile");
  }
}

export async function updateHomeLocationAction(raw: unknown) {
  try {
    const session = await requireAccountSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const parsed = homeLocationUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid location data",
      };
    }

    await connectDb();
    const user = await User.findById(session.user.id);
    if (!user) {
      return { ok: false as const, error: "User not found" };
    }

    const callsign = user.callsign?.trim().toUpperCase() ?? "";
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          homeGrid: parsed.data.homeGrid,
          homeLat: parsed.data.homeLat,
          homeLng: parsed.data.homeLng,
        },
      },
      { strict: false },
    );

    revalidatePath("/account");
    revalidateUserCallsignPaths(callsign);
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: [callsign],
    });
    return {
      ok: true as const,
      homeGrid: parsed.data.homeGrid,
      homeLat: parsed.data.homeLat,
      homeLng: parsed.data.homeLng,
    };
  } catch (error) {
    return failAction(error, "Failed to update home location");
  }
}

export async function requestCallsignVerificationAction(): Promise<
  | { ok: true; status: "pending" }
  | { ok: false; error: string; missing?: Array<"certificate" | "license"> }
> {
  try {
    const session = await requireAccountSession();
    if (!session) {
      return { ok: false, error: "Unauthorized" };
    }

    await connectDb();
    const user = await User.findById(session.user.id);
    if (!user) {
      return { ok: false, error: "User not found" };
    }

    const callsign = user.callsign?.trim().toUpperCase() ?? "";
    if (!callsign) {
      return { ok: false, error: "Set your callsign before requesting verification" };
    }

    const documents = await listUserDocuments(session.user.id);
    const hasCertificate = documents.some((doc) => doc.kind === "certificate");
    const hasLicense = documents.some((doc) => doc.kind === "license");
    const missing = [
      ...(hasCertificate ? [] : (["certificate"] as const)),
      ...(hasLicense ? [] : (["license"] as const)),
    ];
    if (missing.length > 0) {
      return {
        ok: false,
        error: "Upload both certificate and license before requesting verification",
        missing: [...missing],
      };
    }

    const status =
      user.callsignVerificationStatus === "pending" ||
      user.callsignVerificationStatus === "verified" ||
      user.callsignVerificationStatus === "rejected"
        ? user.callsignVerificationStatus
        : Boolean(user.callsignVerified)
          ? "verified"
          : "unverified";

    if (status === "pending") {
      return { ok: false, error: "This callsign is already pending verification" };
    }
    if (status === "verified") {
      return { ok: false, error: "This callsign is already verified" };
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          callsignVerified: false,
          callsignVerificationStatus: "pending",
        },
      },
      { strict: false },
    );

    const reviewers = await User.find({
      role: { $in: ["setup_admin", "system_admin"] },
      email: { $exists: true, $ne: "" },
    })
      .select("email")
      .lean();

    const message = buildCallsignVerificationRequestEmail({
      userId: String(user._id),
      name: user.name?.trim() || callsign,
      email: user.email?.trim() || "",
      callsign,
    });

    await Promise.all(
      reviewers.map((reviewer) =>
        createEmailJob({
          kind: "callsign_verification_request",
          to: reviewer.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
          relatedId: String(user._id),
        }),
      ),
    );

    revalidatePath("/account");
    revalidatePath("/logbook");
    revalidateUserCallsignPaths(callsign);
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: [callsign],
    });

    return { ok: true, status: "pending" };
  } catch (error) {
    return failAction(error, "Failed to request callsign verification");
  }
}

export async function updateSecuritySettingsAction(raw: unknown) {
  try {
    const session = await requireAccountSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    if (
      !raw ||
      typeof raw !== "object" ||
      typeof (raw as { isProfilePublic?: unknown }).isProfilePublic !== "boolean" ||
      typeof (raw as { isQsoPublic?: unknown }).isQsoPublic !== "boolean"
    ) {
      return { ok: false as const, error: "Invalid security settings" };
    }

    await connectDb();
    const user = await User.findById(session.user.id).select("callsign").lean();
    if (!user) {
      return { ok: false as const, error: "User not found" };
    }

    const isProfilePublic = (raw as { isProfilePublic: boolean }).isProfilePublic;
    const isQsoPublic =
      isProfilePublic && (raw as { isQsoPublic: boolean }).isQsoPublic;

    await User.updateOne(
      { _id: session.user.id },
      {
        $set: {
          isProfilePublic,
          isQsoPublic,
        },
      },
    );

    const callsign = user.callsign?.trim() ?? "";
    revalidatePath("/account");
    revalidatePath("/logbook");
    if (callsign) {
      revalidatePath(`/${callsign}`);
      revalidatePath(`/vi/${callsign}`);
      revalidatePath(`/en/${callsign}`);
    }
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: callsign ? [callsign] : [],
    });
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to update security settings");
  }
}

/** Owner profile / documents / security tab data (client-fetched after tab paint). */
export async function loadHamOwnerTabDataAction() {
  try {
    const session = await requireAccountSession();
    if (!session?.user?.id) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const [profile, documents] = await Promise.all([
      getAccountProfile(session.user.id, session.user.email),
      listUserDocuments(session.user.id),
    ]);

    if (!profile) {
      return { ok: false as const, error: "Profile not found" };
    }

    return { ok: true as const, profile, documents };
  } catch (error) {
    return failAction(error, "Failed to load account data");
  }
}
