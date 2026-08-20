"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { invalidateQsoAndHamCache } from "@/lib/cache/qso-cache";
import { connectDb } from "@/lib/db";
import {
  ensureUserCallsignIndex,
  findUserByAssignedCallsign,
} from "@/lib/ham-profile";
import { failAction } from "@/lib/safe-error";
import { profileFormSchema } from "@/lib/validations/qso";
import { User } from "@/models/User";

async function requireAccountSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session;
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
    const update: Record<string, unknown> = {
      name: parsed.data.name,
      callsign: nextCallsign,
      gender: parsed.data.gender,
      callsignVerified:
        Boolean(nextCallsign) &&
        !callsignChanged &&
        Boolean(user.callsignVerified),
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
    if (previousCallsign) {
      revalidatePath(`/${previousCallsign}`);
      revalidatePath(`/vi/${previousCallsign}`);
      revalidatePath(`/en/${previousCallsign}`);
    }
    if (nextCallsign) {
      revalidatePath(`/${nextCallsign}`);
      revalidatePath(`/vi/${nextCallsign}`);
      revalidatePath(`/en/${nextCallsign}`);
    }
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: [previousCallsign, nextCallsign],
    });
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to update profile");
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
