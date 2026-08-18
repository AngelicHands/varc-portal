import {
  getCloudflareMailConfig,
  isCloudflareMailConfigured,
  sendCloudflareMail,
} from "@/lib/mail/cloudflare-mail";
import { recordMailMessage } from "@/lib/mail/mailbox";
import { logServerError } from "@/lib/safe-error";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendBackupReadyEmail(params: {
  to: string;
  downloadUrl: string;
  fileName: string;
  clientKey?: string;
}): Promise<void> {
  try {
    if (!isCloudflareMailConfigured()) return;

    const subject = `VARC portal backup ready — ${params.fileName}`;
    const text = [
      "Your portal backup is ready.",
      "",
      `File: ${params.fileName}`,
      `Download: ${params.downloadUrl}`,
      "",
      "The link requires portal admin access.",
    ].join("\n");
    const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#14201a;">
  <p>Your portal backup is ready.</p>
  <p><strong>File:</strong> ${escapeHtml(params.fileName)}</p>
  <p><a href="${escapeHtml(params.downloadUrl)}">Download backup</a></p>
  <p style="color:#4b5563;">The link requires portal admin access.</p>
</body>
</html>`;

    const result = await sendCloudflareMail(
      {
        to: params.to,
        subject,
        text,
        html,
      },
      { clientKey: params.clientKey },
    );

    await recordMailMessage({
      to: params.to,
      from: result.from || getCloudflareMailConfig().from,
      subject,
      text,
      html,
      status: result.ok ? "sent" : "failed",
      kind: "backup_artifact",
      error: result.ok ? "" : result.error,
    });

    if (!result.ok) {
      logServerError("backup-email", new Error(result.error || "send failed"));
    }
  } catch (error) {
    logServerError("backup-email", error);
  }
}
