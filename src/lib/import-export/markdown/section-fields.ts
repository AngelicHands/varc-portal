export function pushHeadingField(
  lines: string[],
  label: string,
  value: string | number | boolean | null | undefined,
): void {
  if (value == null) return;
  const text = String(value).trim();
  if (!text) return;
  lines.push(`### ${label}`);
  lines.push(text);
  lines.push("");
}
