export type CodeBlockTheme =
  | "light"
  | "dark"
  | "ocean"
  | "forest"
  | "sunset"
  | "varc-editor";

export type CodeBlockLanguageOption = {
  value: string;
  label: string;
};

export const CODE_BLOCK_THEMES: {
  value: CodeBlockTheme;
  label: string;
  swatch: string;
}[] = [
  { value: "light", label: "Light+", swatch: "#ffffff" },
  { value: "dark", label: "Dark+", swatch: "#1e1e1e" },
  { value: "ocean", label: "Abyss", swatch: "#0d1117" },
  { value: "forest", label: "Forest", swatch: "#1e2d1e" },
  { value: "sunset", label: "Sunset", swatch: "#2a1f1a" },
  { value: "varc-editor", label: "Varc-editor", swatch: "#f5f5f5" },
];

export const CODE_BLOCK_LANGUAGES: CodeBlockLanguageOption[] = [
  { value: "", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "csharp", label: "C#" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "dockerfile", label: "Dockerfile" },
];

export function codeBlockLanguageLabel(language: string | null | undefined): string {
  const value = String(language ?? "").trim();
  if (!value) return "Plain Text";
  return (
    CODE_BLOCK_LANGUAGES.find((option) => option.value === value)?.label ?? value
  );
}

export function normalizeCodeBlockTheme(value: unknown): CodeBlockTheme {
  const theme = String(value ?? "").trim();
  if (CODE_BLOCK_THEMES.some((option) => option.value === theme)) {
    return theme as CodeBlockTheme;
  }
  return "dark";
}

export function parseBooleanAttr(
  value: string | null | undefined,
  defaultValue: boolean,
): boolean {
  if (value == null || value === "") return defaultValue;
  return value === "true";
}
