import { getPublicBaseUrl } from "@/lib/public-url";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCallsignVerificationRequestEmail(params: {
  userId: string;
  name: string;
  email: string;
  callsign: string;
}) {
  const adminUrl = `${getPublicBaseUrl()}/admin/users/${params.userId}`;
  const subject = `Callsign verification request: ${params.callsign}`;
  const text = [
    "Hello,",
    "",
    `${params.name} requested verification for callsign ${params.callsign}.`,
    "",
    `Name: ${params.name}`,
    `Email: ${params.email}`,
    `Callsign: ${params.callsign}`,
    "",
    `Review documents and approve or reject: ${adminUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#14201a;">
  <p>Hello,</p>
  <p><strong>${escapeHtml(params.name)}</strong> requested verification for callsign <strong>${escapeHtml(params.callsign)}</strong>.</p>
  <ul>
    <li><strong>Name:</strong> ${escapeHtml(params.name)}</li>
    <li><strong>Email:</strong> ${escapeHtml(params.email)}</li>
    <li><strong>Callsign:</strong> ${escapeHtml(params.callsign)}</li>
  </ul>
  <p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;">Review verification request</a></p>
  <p style="color:#4b5563;">Open the admin user page to check uploaded certificate and license documents, then approve or reject.</p>
</body>
</html>`;

  return { subject, text, html };
}
