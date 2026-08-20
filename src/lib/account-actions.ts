"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { connectDb } from "@/lib/db";
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
    const user = await User.findById(session.user.id);
    if (!user) {
      return { ok: false as const, error: "User not found" };
    }

    const previousCallsign = (user.callsign?.trim() ?? "").toUpperCase();
    const nextCallsign = parsed.data.callsign;
    const callsignChanged = nextCallsign !== previousCallsign;

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          name: parsed.data.name,
          callsign: nextCallsign,
          callsignVerified:
            Boolean(nextCallsign) &&
            !callsignChanged &&
            Boolean(user.callsignVerified),
        },
      },
      { strict: false },
    );

    revalidatePath("/account");
    revalidatePath("/logbook");
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to update profile");
  }
}
