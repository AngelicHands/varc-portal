"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  CallsignExistsError,
  createAdminCallsign,
  deleteAdminCallsign,
  deleteAdminCallsignLicense,
  saveAdminCallsignLicense,
  updateAdminCallsignDetails,
} from "@/lib/callsigns-admin";
import { importCallsignPayload } from "@/lib/callsigns-import";
import { parseCallsignXlsx } from "@/lib/callsigns-xlsx";
import {
  callsignDetailsSchema,
  callsignFormSchema,
  callsignLicenseSchema,
} from "@/lib/validations/callsigns";
import { canManageSite, isAdminRole } from "@/lib/roles";
import { failAction } from "@/lib/safe-error";

async function requireCallsignManager() {
  const session = await auth();
  if (!session?.user?.id || !isAdminRole(session.user)) {
    throw new Error("Unauthorized");
  }
  if (!canManageSite(session.user)) {
    throw new Error("Forbidden");
  }
  return session;
}

async function refreshCallsignPaths(sign?: string) {
  revalidatePath("/admin/callsigns");
  revalidatePath("/vi/callsigns");
  revalidatePath("/en/callsigns");
  if (sign) {
    revalidatePath(`/admin/callsigns/${sign}`);
    revalidatePath(`/vi/callsigns/${sign}`);
    revalidatePath(`/en/callsigns/${sign}`);
  }
}

export async function importCallsignsExcelAction(formData: FormData) {
  try {
    await requireCallsignManager();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: "Choose an Excel .xlsx file" };
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { ok: false as const, error: "Upload an .xlsx workbook" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const payload = await parseCallsignXlsx(buffer, file.name);
    const replace = formData.get("replace") === "on";
    const result = await importCallsignPayload(payload, { replace });
    await refreshCallsignPaths();
    return {
      ok: true as const,
      events: result.events,
      callsigns: result.callsigns,
      operators: result.operators,
    };
  } catch (error) {
    return failAction(error, "Failed to import callsigns");
  }
}

export async function createCallsignAction(input: unknown) {
  try {
    await requireCallsignManager();
    const parsed = callsignFormSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message || "Invalid callsign",
      };
    }
    const created = await createAdminCallsign(parsed.data);
    await refreshCallsignPaths(created.sign);
    return { ok: true as const, sign: created.sign };
  } catch (error) {
    if (
      error instanceof CallsignExistsError ||
      (error instanceof Error && error.name === "CallsignExistsError")
    ) {
      const sign =
        error instanceof CallsignExistsError
          ? error.sign
          : error.message.replace(/^Callsign\s+/i, "").replace(/\s+already exists$/i, "");
      return {
        ok: false as const,
        error: `Callsign ${sign} already exists. Open it to add or edit licenses.`,
        existingSign: sign,
      };
    }
    return failAction(error, "Failed to create callsign");
  }
}

export async function updateCallsignAction(sign: string, input: unknown) {
  try {
    await requireCallsignManager();
    const parsed = callsignDetailsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message || "Invalid callsign",
      };
    }
    const updated = await updateAdminCallsignDetails(sign, parsed.data);
    await refreshCallsignPaths(updated.sign);
    return { ok: true as const, sign: updated.sign };
  } catch (error) {
    return failAction(error, "Failed to save callsign");
  }
}

export async function saveCallsignLicenseAction(sign: string, input: unknown) {
  try {
    await requireCallsignManager();
    const parsed = callsignLicenseSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message || "Invalid license event",
      };
    }
    const result = await saveAdminCallsignLicense(sign, {
      ...parsed.data,
      issuedAt: parsed.data.issuedAt || null,
      expiresAt: parsed.data.expiresAt || null,
    });
    await refreshCallsignPaths(result.sign);
    return { ok: true as const, sign: result.sign, record: result.record };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "License event not found" ||
        error.message === "Callsign not found" ||
        error.message === "Operator name is required")
    ) {
      return { ok: false as const, error: error.message };
    }
    return failAction(error, "Failed to save license event");
  }
}

export async function deleteCallsignLicenseAction(
  sign: string,
  licenseId: string,
) {
  try {
    await requireCallsignManager();
    const result = await deleteAdminCallsignLicense(sign, licenseId);
    await refreshCallsignPaths(result.sign);
    return { ok: true as const, sign: result.sign };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Keep at least one license event" ||
        error.message === "License event not found" ||
        error.message === "Callsign not found")
    ) {
      return { ok: false as const, error: error.message };
    }
    return failAction(error, "Failed to delete license event");
  }
}

export async function deleteCallsignAction(sign: string) {
  try {
    await requireCallsignManager();
    await deleteAdminCallsign(sign);
    await refreshCallsignPaths(sign);
    return { ok: true as const };
  } catch (error) {
    return failAction(error, "Failed to delete callsign");
  }
}
