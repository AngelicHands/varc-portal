"use server";

import bcrypt from "bcryptjs";
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
import { profilePatchSchema, homeLocationUpdateSchema, changePasswordSchema } from "@/lib/validations/qso";
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

    const parsed = profilePatchSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid profile data",
      };
    }

    const patch = parsed.data;

    await connectDb();
    await ensureUserCallsignIndex();
    const user = await User.findById(session.user.id);
    if (!user) {
      return { ok: false as const, error: "User not found" };
    }

    const previousCallsign = (user.callsign?.trim() ?? "").toUpperCase();
    let nextCallsign = previousCallsign;

    // Only the keys present in the patch are written; untouched fields are left alone.
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};

    if (patch.name !== undefined) {
      set.name = patch.name;
    }
    if (patch.gender !== undefined) {
      set.gender = patch.gender;
    }
    if (patch.birthday !== undefined) {
      if (patch.birthday) {
        set.birthday = new Date(`${patch.birthday}T12:00:00.000Z`);
      } else {
        unset.birthday = 1;
      }
    }
    if (patch.homeGrid !== undefined) {
      // Grid and GPS point move together — a grid without both coords clears the marker.
      const hasLocation =
        Boolean(patch.homeGrid) &&
        typeof patch.homeLat === "number" &&
        typeof patch.homeLng === "number";
      set.homeGrid = patch.homeGrid;
      set.homeLat = hasLocation ? patch.homeLat : null;
      set.homeLng = hasLocation ? patch.homeLng : null;
    }
    if (patch.callsign !== undefined) {
      nextCallsign = patch.callsign;
      if (nextCallsign) {
        const taken = await findUserByAssignedCallsign(nextCallsign, user._id);
        if (taken) {
          return {
            ok: false as const,
            error: "Callsign is already assigned to another user",
          };
        }
      }
      // Verification only survives when the callsign itself is unchanged.
      // Clearing the callsign always drops it back to unverified.
      const keepsVerification =
        Boolean(nextCallsign) &&
        nextCallsign === previousCallsign &&
        Boolean(user.callsignVerified);
      set.callsign = nextCallsign;
      set.callsignVerified = keepsVerification;
      set.callsignVerificationStatus = keepsVerification ? "verified" : "unverified";
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    if (Object.keys(update).length === 0) {
      return { ok: false as const, error: "No profile changes" };
    }

    await User.updateOne({ _id: user._id }, update, { strict: false });

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

export async function changePasswordAction(raw: unknown) {
  try {
    const session = await requireAccountSession();
    if (!session) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const parsed = changePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false as const,
        error: issue?.message ?? "Invalid password",
      };
    }

    await connectDb();
    const user = await User.findById(session.user.id).select("passwordHash").lean();
    if (!user) {
      return { ok: false as const, error: "User not found" };
    }

    const hasPassword = Boolean(user.passwordHash);
    if (hasPassword) {
      const currentPassword = parsed.data.currentPassword?.trim() ?? "";
      if (!currentPassword) {
        return { ok: false as const, error: "Current password is required" };
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash!);
      if (!valid) {
        return { ok: false as const, error: "Current password is incorrect" };
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await User.updateOne({ _id: session.user.id }, { $set: { passwordHash } });

    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to change password");
  }
}

/** Owner profile / documents / privacy / security tab data (client-fetched after tab paint). */
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
