import {
  getCloudflareMailConfig,
  isCloudflareMailConfigured,
  sendCloudflareMail,
} from "@/lib/mail/cloudflare-mail";
import {
  markEmailJobFailed,
  markEmailJobSucceeded,
} from "@/lib/mail/jobs";
import { recordMailMessage } from "@/lib/mail/mailbox";
import { logServerError } from "@/lib/safe-error";
import type { EmailJobDocument } from "@/models/EmailJob";

export async function processEmailJob(job: EmailJobDocument): Promise<void> {
  const jobId = String(job._id);

  if (!isCloudflareMailConfigured()) {
    await markEmailJobFailed({
      id: jobId,
      error: "Cloudflare mail is not configured",
      retry: false,
    });
    return;
  }

  try {
    const result = await sendCloudflareMail(
      {
        to: job.to,
        subject: job.subject,
        text: job.text,
        html: job.html,
      },
      { clientKey: job.clientKey || undefined },
    );

    const mailMessageId = await recordMailMessage({
      to: job.to,
      from: result.from || getCloudflareMailConfig().from,
      subject: job.subject,
      text: job.text,
      html: job.html,
      status: result.ok ? "sent" : "failed",
      kind: job.kind,
      error: result.ok ? "" : result.error,
    });

    if (!result.ok) {
      await markEmailJobFailed({
        id: jobId,
        error: result.error || "Failed to send email",
        retry: true,
      });
      return;
    }

    await markEmailJobSucceeded({
      id: jobId,
      mailMessageId: mailMessageId ?? "",
    });
  } catch (error) {
    logServerError("email-worker", error);
    await markEmailJobFailed({
      id: jobId,
      error: error instanceof Error ? error.message : "Failed to send email",
      retry: true,
    });
  }
}
