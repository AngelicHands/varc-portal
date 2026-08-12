import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  allowFormSubmission,
  createFormSubmission,
  getPublishedFormById,
  validateSubmissionPayload,
} from "@/lib/forms";
import { sendFormSubmissionCopyToRequestor } from "@/lib/mail/form-submission-email";

type Payload = {
  values?: Record<string, unknown>;
  pagePath?: string;
  website?: string;
};

function hashIp(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const form = await getPublishedFormById(id);
  if (!form) {
    return NextResponse.json(
      { ok: false, error: "Form not found" },
      { status: 404 },
    );
  }

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  if ((body.website ?? "").trim()) {
    return NextResponse.json({ ok: true, message: form.successMessage });
  }

  const headerBag = await headers();
  const forwarded = headerBag.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const userAgent = headerBag.get("user-agent") ?? "";
  const allowed = await allowFormSubmission(`${id}:${ip}`, 10, 60);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Please try again shortly." },
      { status: 429 },
    );
  }

  const validated = validateSubmissionPayload(form.fields, body.values ?? {});
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const submission = await createFormSubmission({
    form,
    payload: validated.data,
    pagePath: body.pagePath ?? "",
    userAgent,
    ipHash: ip === "unknown" ? "" : hashIp(ip),
  });

  // Best-effort confirmation to the requestor — never fails the submission.
  await sendFormSubmissionCopyToRequestor({
    form,
    payload: validated.data,
    submissionId: submission.id,
    clientKey: ip,
  });

  return NextResponse.json({
    ok: true,
    message: form.successMessage,
  });
}
