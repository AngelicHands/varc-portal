function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildQsoConfirmationEmail(params: {
  recipientName: string;
  stationCallsign: string;
  workedCallsign: string;
  qsoAtDisplay: string;
  band: string;
  mode: string;
  confirmUrl: string;
}) {
  const subject = `QSO confirmation request from ${params.stationCallsign}`;
  const text = [
    `Hello ${params.recipientName},`,
    "",
    `${params.stationCallsign} logged a QSO with your callsign ${params.workedCallsign}.`,
    "",
    `Date & time: ${params.qsoAtDisplay}`,
    `Band: ${params.band}`,
    `Mode: ${params.mode}`,
    "",
    `Confirm this QSO: ${params.confirmUrl}`,
    "",
    "This link expires in 30 days.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#14201a;">
  <p>Hello ${escapeHtml(params.recipientName)},</p>
  <p><strong>${escapeHtml(params.stationCallsign)}</strong> logged a QSO with your callsign <strong>${escapeHtml(params.workedCallsign)}</strong>.</p>
  <ul>
    <li><strong>Date &amp; time:</strong> ${escapeHtml(params.qsoAtDisplay)}</li>
    <li><strong>Band:</strong> ${escapeHtml(params.band)}</li>
    <li><strong>Mode:</strong> ${escapeHtml(params.mode)}</li>
  </ul>
  <p><a href="${escapeHtml(params.confirmUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;">Confirm QSO</a></p>
  <p style="color:#4b5563;">This link expires in 30 days.</p>
</body>
</html>`;

  return { subject, text, html };
}
