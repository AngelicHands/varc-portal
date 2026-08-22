"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

function safeCallbackPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/qso";
  }
  return value;
}

export async function portalCredentialsSignInAction(input: {
  email: string;
  password: string;
  callbackUrl: string;
}): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const callbackUrl = safeCallbackPath(input.callbackUrl);
  try {
    await signIn("credentials", {
      email: input.email,
      password: input.password,
      redirectTo: callbackUrl,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "invalid" };
    }
    throw error;
  }
}

export async function portalGoogleSignInAction(callbackUrl: string) {
  await signIn("google", { redirectTo: safeCallbackPath(callbackUrl) });
}
