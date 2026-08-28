export function splitCodeLines(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (normalized === "") return [""];

  const lines = normalized.split("\n");
  if (normalized.endsWith("\n") && lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.length > 0 ? lines : [""];
}

export function codeBlockLineNumbersText(text: string): string {
  const lines = splitCodeLines(text);
  return lines.map((_, index) => String(index + 1)).join("\n");
}
