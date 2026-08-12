import type { PublicFormDefinition, PublicFormField } from "@/lib/forms";
import {
  getCloudflareMailConfig,
  isCloudflareMailConfigured,
  sendCloudflareMail,
} from "@/lib/mail/cloudflare-mail";
import { recordMailMessage } from "@/lib/mail/mailbox";
import { logServerError } from "@/lib/safe-error";
import {
  isFormUploadValue,
  type FormSubmissionValue,
} from "@/lib/validations/forms";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function optionLabel(field: PublicFormField, value: string) {
  return (
    field.options.find((option) => option.value === value)?.label ?? value
  );
}

export function formatSubmissionAnswer(
  field: PublicFormField | undefined,
  value: FormSubmissionValue,
): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => (field ? optionLabel(field, item) : item))
      .join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (isFormUploadValue(value)) {
    return value.url
      ? `${value.originalName} (${value.url})`
      : value.originalName;
  }
  if (typeof value === "string") {
    if (!value.trim()) return "—";
    return field ? optionLabel(field, value) : value;
  }
  return "—";
}

/** First non-empty email-typed answer in the submission. */
export function findRequestorEmail(
  fields: PublicFormField[],
  payload: Record<string, FormSubmissionValue>,
): string {
  for (const field of fields) {
    if (field.type !== "email") continue;
    const value = payload[field.name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildFormCopyLines(
  form: PublicFormDefinition,
  payload: Record<string, FormSubmissionValue>,
) {
  const fieldsByName = new Map(form.fields.map((field) => [field.name, field]));
  const lines: { label: string; value: string }[] = [];

  for (const field of form.fields) {
    if (!(field.name in payload)) continue;
    lines.push({
      label: field.label || field.name,
      value: formatSubmissionAnswer(field, payload[field.name]),
    });
  }

  for (const [name, value] of Object.entries(payload)) {
    if (fieldsByName.has(name)) continue;
    lines.push({
      label: name,
      value: formatSubmissionAnswer(undefined, value),
    });
  }

  return lines;
}

export function buildFormSubmissionCopyEmail(params: {
  form: PublicFormDefinition;
  payload: Record<string, FormSubmissionValue>;
}) {
  const { form, payload } = params;
  const rows = buildFormCopyLines(form, payload);
  const formTitle = form.name.trim() || "Application form";

  const textLines = [
    "Thank you for submitting.",
    "",
    `Here is a copy of your application (${formTitle}):`,
    "",
    ...rows.map((row) => `${row.label}: ${row.value}`),
  ];

  const htmlRows = rows
    .map(
      (row) =>
        `<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</th><td style="padding:6px 0;vertical-align:top;">${escapeHtml(row.value).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#14201a;">
  <p>Thank you for submitting.</p>
  <p>Here is a copy of your application (<strong>${escapeHtml(formTitle)}</strong>):</p>
  <table style="border-collapse:collapse;width:100%;max-width:640px;">${htmlRows}</table>
</body>
</html>`;

  return {
    subject: `Thank you for submitting — ${formTitle}`,
    text: textLines.join("\n"),
    html,
  };
}

/**
 * Email a thank-you note + form copy to the requestor.
 * Records the attempt in the admin outbox. Never throws.
 */
export async function sendFormSubmissionCopyToRequestor(params: {
  form: PublicFormDefinition;
  payload: Record<string, FormSubmissionValue>;
  submissionId?: string | null;
}): Promise<void> {
  try {
    const to = findRequestorEmail(params.form.fields, params.payload);
    if (!to) return;
    if (!isCloudflareMailConfigured()) return;

    const message = buildFormSubmissionCopyEmail(params);
    const result = await sendCloudflareMail({ to, ...message });

    await recordMailMessage({
      to,
      from: result.from || getCloudflareMailConfig().from,
      subject: message.subject,
      text: message.text,
      html: message.html,
      status: result.ok ? "sent" : "failed",
      kind: "form_submission_copy",
      error: result.ok ? "" : result.error,
      formId: params.form.id,
      formNameSnapshot: params.form.name,
      submissionId: params.submissionId ?? null,
    });

    if (!result.ok) {
      logServerError(
        "form-submission-mail",
        new Error(result.error || "send failed"),
      );
    }
  } catch (error) {
    logServerError("form-submission-mail", error);
  }
}
