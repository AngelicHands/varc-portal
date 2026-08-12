import { logServerError } from "@/lib/safe-error";
import { allowMailSend } from "@/lib/mail/rate-limit";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendMailOptions = {
  /** Rate-limit bucket key — typically client IP from the triggering request. */
  clientKey?: string;
};

type CloudflareSendResult = {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: {
    delivered?: string[];
    permanent_bounces?: string[];
    queued?: string[];
  } | null;
};

export function getCloudflareMailConfig() {
  const apiToken = process.env.CF_MAIL_API_TOKEN?.trim() ?? "";
  const accountId = process.env.CF_MAIL_ACCOUNT_ID?.trim() ?? "";
  const from = process.env.CF_MAIL_FROM?.trim() ?? "";
  return { apiToken, accountId, from };
}

/** True when Cloudflare mail credentials are present in the environment. */
export function isCloudflareMailConfigured() {
  const { apiToken, accountId, from } = getCloudflareMailConfig();
  return Boolean(apiToken && accountId && from);
}

/**
 * Send mail via Cloudflare Email Sending REST API:
 * POST /accounts/{account_id}/email/sending/send
 */
export async function sendCloudflareMail(
  input: SendMailInput,
  options: SendMailOptions = {},
): Promise<{ ok: true; from: string } | { ok: false; error: string; from: string }> {
  const { apiToken, accountId, from } = getCloudflareMailConfig();
  if (!apiToken || !accountId || !from) {
    return { ok: false, error: "Cloudflare mail is not configured", from };
  }

  const to = input.to.trim();
  if (!to) {
    return { ok: false, error: "Missing recipient", from };
  }

  const rateLimit = await allowMailSend(options.clientKey ?? "");
  if (!rateLimit.allowed) {
    return { ok: false, error: rateLimit.reason, from };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        from,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });

    const json = (await response.json().catch(() => null)) as
      | CloudflareSendResult
      | null;

    if (!response.ok || !json?.success) {
      const detail =
        json?.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
        `HTTP ${response.status}`;
      logServerError("cloudflare-mail", new Error(detail));
      return { ok: false, error: detail || "Failed to send email", from };
    }

    return { ok: true, from };
  } catch (error) {
    logServerError("cloudflare-mail", error);
    return { ok: false, error: "Failed to send email", from };
  }
}
