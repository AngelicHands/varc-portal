import { z } from "zod";

export function formatZodIssues(
  error: z.ZodError,
  limit = 12,
): string {
  const lines = error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "form";
    return `${path}: ${issue.message}`;
  });
  if (error.issues.length > limit) {
    lines.push(`…and ${error.issues.length - limit} more issue(s)`);
  }
  return lines.join("\n") || "Invalid data";
}

const MAX_TEXT = 5_000;
const MAX_MARKDOWN = 50_000;

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "select",
  "checkbox",
  "radio",
  "date",
  "date_time",
  "image",
  "file",
] as const;

export const FORM_FIELD_WIDTHS = [
  "default",
  "medium",
  "wide",
  "full-width",
] as const;
export const FORM_FIELD_STYLES = [
  "default",
  "borderless",
  "underline",
  "dotted_underline",
] as const;

export const FORM_UPLOAD_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const FORM_UPLOAD_FILE_MIME = [
  ...FORM_UPLOAD_IMAGE_MIME,
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const FORM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export type FormFieldWidth = (typeof FORM_FIELD_WIDTHS)[number];
export type FormFieldStyle = (typeof FORM_FIELD_STYLES)[number];

/** Map legacy full/half values and markdown aliases onto current presets. */
export function normalizeFormFieldWidth(value: unknown): FormFieldWidth {
  if (value === "full" || value === "full-width") return "full-width";
  if (value === "half" || value === "medium") return "medium";
  if (value === "wide") return "wide";
  if (value === "default") return "default";
  return "default";
}

export type FormUploadValue = {
  url: string;
  key: string;
  originalName: string;
  contentType: string;
  size: number;
};

export type FormSubmissionValue = string | boolean | string[] | FormUploadValue;

export const formUploadValueSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  key: z.string().trim().min(1).max(500),
  originalName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(FORM_UPLOAD_MAX_BYTES),
});

export function isFormUploadValue(value: unknown): value is FormUploadValue {
  return formUploadValueSchema.safeParse(value).success;
}

export const formFieldOptionSchema = z.object({
  label: z.string().trim().min(1, "Option label is required").max(200),
  value: z.string().trim().min(1, "Option value is required").max(200),
});

export type FormFieldOption = z.infer<typeof formFieldOptionSchema>;

const formFieldWidthSchema = z
  .string()
  .optional()
  .transform((value): FormFieldWidth => normalizeFormFieldWidth(value));

export const formFieldSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    type: z.enum(FORM_FIELD_TYPES),
    name: z
      .string()
      .trim()
      .min(1, "Field key is required")
      .max(64)
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Field key must start with a letter and use only lowercase letters, numbers, and underscores",
      ),
    label: z.string().trim().min(1, "Field label is required").max(200),
    required: z.boolean(),
    placeholder: z.string().trim().max(500).default(""),
    helpText: z.string().trim().max(MAX_TEXT).default(""),
    maxLength: z.number().int().min(0).max(MAX_TEXT).default(0),
    width: formFieldWidthSchema.default("default"),
    style: z.enum(FORM_FIELD_STYLES).default("default"),
    options: z.array(formFieldOptionSchema).max(100).default([]),
  })
  .superRefine((field, ctx) => {
    if (
      field.maxLength > 0 &&
      field.type !== "text" &&
      field.type !== "textarea"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Max length is only supported for text and textarea fields",
        path: ["maxLength"],
      });
    }
    if (
      field.type === "select" ||
      field.type === "radio" ||
      (field.type === "checkbox" && field.options.length > 0)
    ) {
      if (field.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "This field needs at least one option",
          path: ["options"],
        });
      }
      return;
    }
    if (field.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Only select, radio, or grouped checkbox fields may define options",
        path: ["options"],
      });
    }
  });

export type FormFieldDefinition = z.infer<typeof formFieldSchema>;

export const FORM_DEFINITION_MODES = ["fields", "markdown"] as const;
export type FormDefinitionMode = (typeof FORM_DEFINITION_MODES)[number];

export const formLocaleSchema = z.object({
  name: z.string().trim().max(200).default(""),
  description: z.string().trim().max(MAX_TEXT).default(""),
  submitLabel: z.string().trim().max(120).default(""),
  successMessage: z.string().trim().max(MAX_TEXT).default(""),
  schemaMarkdown: z.string().max(MAX_MARKDOWN).default(""),
  fields: z.array(formFieldSchema).max(100).default([]),
});

export type FormLocaleValues = z.infer<typeof formLocaleSchema>;
export type FormLocaleInput = z.input<typeof formLocaleSchema>;

function fieldStructureKey(fields: FormFieldDefinition[]) {
  return fields
    .map(
      (field) =>
        `${field.name}:${field.type}:${field.options.map((option) => option.value).join(",")}`,
    )
    .join("|");
}

function refineFormLocale(
  locale: z.infer<typeof formLocaleSchema>,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  options: { requireContent: boolean; requireChrome: boolean },
) {
  const hasMarkdown = locale.schemaMarkdown.trim().length > 0;
  const hasFields = locale.fields.length > 0;

  if (options.requireChrome) {
    if (!locale.name.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Name is required",
        path: [...path, "name"],
      });
    }
    if (!locale.submitLabel.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Submit label is required",
        path: [...path, "submitLabel"],
      });
    }
    if (!locale.successMessage.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Success message is required",
        path: [...path, "successMessage"],
      });
    }
  }

  if (options.requireContent && !hasMarkdown && !hasFields) {
    ctx.addIssue({
      code: "custom",
      message: "Provide either markdown schema or at least one field",
      path: [...path, "schemaMarkdown"],
    });
  }

  if (hasMarkdown) {
    const parsed = parseFormSchemaMarkdown(locale.schemaMarkdown);
    if (!parsed.ok) {
      ctx.addIssue({
        code: "custom",
        message: parsed.error,
        path: [...path, "schemaMarkdown"],
      });
    }
  }

  const names = new Set<string>();
  for (const [index, field] of locale.fields.entries()) {
    if (names.has(field.name)) {
      ctx.addIssue({
        code: "custom",
        message: "Field keys must be unique",
        path: [...path, "fields", index, "name"],
      });
    }
    names.add(field.name);
  }
}

function normalizeFormLocale(locale: z.infer<typeof formLocaleSchema>) {
  const markdown = locale.schemaMarkdown.trim();
  if (!markdown) {
    return {
      ...locale,
      name: locale.name.trim(),
      description: locale.description.trim(),
      submitLabel: locale.submitLabel.trim(),
      successMessage: locale.successMessage.trim(),
      schemaMarkdown: "",
    };
  }
  const parsed = parseFormSchemaMarkdown(markdown);
  if (!parsed.ok) {
    return {
      ...locale,
      name: locale.name.trim(),
      description: locale.description.trim(),
      submitLabel: locale.submitLabel.trim(),
      successMessage: locale.successMessage.trim(),
      schemaMarkdown: markdown,
    };
  }
  return {
    ...locale,
    name: locale.name.trim(),
    description: locale.description.trim(),
    submitLabel: locale.submitLabel.trim(),
    successMessage: locale.successMessage.trim(),
    schemaMarkdown: markdown,
    fields: parsed.fields,
  };
}

export const formDefinitionFormSchema = z
  .object({
    status: z.enum(["draft", "published"]),
    definitionMode: z.enum(FORM_DEFINITION_MODES),
    locales: z.object({
      vi: formLocaleSchema,
      en: formLocaleSchema,
    }),
  })
  .superRefine((data, ctx) => {
    const mode = data.definitionMode;
    const vi = data.locales.vi;

    refineFormLocale(vi, ctx, ["locales", "vi"], {
      requireContent: false,
      requireChrome: true,
    });

    if (mode === "markdown") {
      if (!vi.schemaMarkdown.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Markdown layout is required",
          path: ["locales", "vi", "schemaMarkdown"],
        });
      } else {
        const parsed = parseFormSchemaMarkdown(vi.schemaMarkdown);
        if (!parsed.ok) {
          ctx.addIssue({
            code: "custom",
            message: parsed.error,
            path: ["locales", "vi", "schemaMarkdown"],
          });
        }
      }
    } else if (vi.fields.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one field",
        path: ["locales", "vi", "fields"],
      });
    }

    const names = new Set<string>();
    for (const [index, field] of vi.fields.entries()) {
      if (mode === "fields" && names.has(field.name)) {
        ctx.addIssue({
          code: "custom",
          message: "Field keys must be unique",
          path: ["locales", "vi", "fields", index, "name"],
        });
      }
      names.add(field.name);
    }

    const en = data.locales.en;
    const enHasContent =
      Boolean(en.name.trim()) ||
      Boolean(en.schemaMarkdown.trim()) ||
      en.fields.length > 0 ||
      Boolean(en.description.trim());

    if (enHasContent) {
      refineFormLocale(en, ctx, ["locales", "en"], {
        requireContent: false,
        requireChrome: true,
      });
    }

    if (mode === "markdown") {
      const viMarkdown = vi.schemaMarkdown.trim();
      const enMarkdown = en.schemaMarkdown.trim();
      if (viMarkdown && enMarkdown) {
        const viParsed = parseFormSchemaMarkdown(viMarkdown);
        const enParsed = parseFormSchemaMarkdown(enMarkdown);
        if (
          viParsed.ok &&
          enParsed.ok &&
          fieldStructureKey(viParsed.fields) !==
            fieldStructureKey(enParsed.fields)
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "English markdown must define the same field keys, types, and option values as Vietnamese",
            path: ["locales", "en", "schemaMarkdown"],
          });
        }
      }
    }
  })
  .transform((data) => {
    if (data.definitionMode === "fields") {
      return {
        status: data.status,
        definitionMode: "fields" as const,
        locales: {
          vi: {
            ...normalizeFormLocale({
              ...data.locales.vi,
              schemaMarkdown: "",
            }),
            schemaMarkdown: "",
            fields: data.locales.vi.fields,
          },
          en: {
            ...normalizeFormLocale({
              ...data.locales.en,
              schemaMarkdown: "",
              fields: [],
            }),
            schemaMarkdown: "",
            fields: [],
          },
        },
      };
    }

    return {
      status: data.status,
      definitionMode: "markdown" as const,
      locales: {
        vi: normalizeFormLocale(data.locales.vi),
        en: normalizeFormLocale({
          ...data.locales.en,
          // Keep EN fields only when markdown is present; otherwise fall back to VI.
          fields: data.locales.en.schemaMarkdown.trim()
            ? data.locales.en.fields
            : [],
        }),
      },
    };
  });

export type FormDefinitionFormValues = z.input<typeof formDefinitionFormSchema>;
export type FormDefinitionFormData = z.infer<typeof formDefinitionFormSchema>;

export const FORM_SUBMISSION_STATUSES = ["new", "reviewed", "archived"] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

const FIELD_TYPE_PATTERN =
  "text|textarea|email|phone|select|checkbox|radio|date_time|date|image|file";

/** Simple tokens without nested `]` — prefer `scanMarkdownFieldTokens`. */
export const MARKDOWN_FIELD_TOKEN_RE = new RegExp(
  `#!\\[(${FIELD_TYPE_PATTERN}):\\{([a-z][a-z0-9_]*)\\}([^\\]]*)\\]`,
  "gi",
);

export type ParsedMarkdownFieldToken = {
  type: FormFieldType;
  name: string;
  options: FormFieldOption[];
  placeholder: string;
  style: FormFieldStyle;
  width: FormFieldWidth;
  required: boolean;
  helpText: string;
  maxLength: number;
};

function findBalancedEnd(
  source: string,
  start: number,
  open: string,
  close: string,
): number {
  if (source[start] !== open) return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Find `#![...]` tokens, allowing nested `[]` / `{}` inside options. */
export function scanMarkdownFieldTokens(
  markdown: string,
): Array<{ raw: string; index: number }> {
  const results: Array<{ raw: string; index: number }> = [];
  let cursor = 0;

  while (cursor < markdown.length) {
    const start = markdown.indexOf("#![", cursor);
    if (start < 0) break;
    // Step markers use `!#![step:...]` — skip those.
    if (start > 0 && markdown[start - 1] === "!") {
      cursor = start + 3;
      continue;
    }
    const openBracket = start + 2; // points at '['
    const end = findBalancedEnd(markdown, openBracket, "[", "]");
    if (end < 0) {
      cursor = start + 3;
      continue;
    }
    results.push({
      raw: markdown.slice(start, end + 1),
      index: start,
    });
    cursor = end + 1;
  }

  return results;
}

export function replaceMarkdownFieldTokens(
  markdown: string,
  replace: (raw: string, tokenIndex: number) => string,
): string {
  const matches = scanMarkdownFieldTokens(markdown);
  if (matches.length === 0) return markdown;

  let result = "";
  let cursor = 0;
  matches.forEach((match, tokenIndex) => {
    result += markdown.slice(cursor, match.index);
    result += replace(match.raw, tokenIndex);
    cursor = match.index + match.raw.length;
  });
  result += markdown.slice(cursor);
  return result;
}

function optionValue(label: string) {
  const normalized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "option";
}

function readQuotedString(
  source: string,
  start: number,
): { value: string; end: number } | null {
  if (source[start] !== '"') return null;
  let i = start + 1;
  let value = "";
  let escaped = false;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (escaped) {
      value += ch;
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      return { value, end: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

function parseOptionObject(raw: string): FormFieldOption | null {
  const body = raw.trim().replace(/^\{/, "").replace(/\}$/, "").trim();
  if (!body) return null;

  let label = "";
  let value = "";
  let i = 0;
  const bareStrings: string[] = [];

  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i] ?? "")) i += 1;
    if (i >= body.length) break;

    if (body[i] === '"') {
      const quoted = readQuotedString(body, i);
      if (!quoted) break;
      bareStrings.push(quoted.value);
      i = quoted.end;
      continue;
    }

    const keyStart = i;
    while (i < body.length && /[a-zA-Z0-9_]/.test(body[i] ?? "")) i += 1;
    const key = body.slice(keyStart, i).toLowerCase();
    while (i < body.length && /\s/.test(body[i] ?? "")) i += 1;
    if (body[i] !== ":") {
      // indexed noise like `1:` — skip until next comma / value
      if (body[i] === ":") {
        i += 1;
        continue;
      }
      break;
    }
    i += 1;
    while (i < body.length && /\s/.test(body[i] ?? "")) i += 1;

    let parsedValue = "";
    if (body[i] === '"') {
      const quoted = readQuotedString(body, i);
      if (!quoted) break;
      parsedValue = quoted.value;
      i = quoted.end;
    } else {
      const valueStart = i;
      while (i < body.length && body[i] !== ",") i += 1;
      parsedValue = body.slice(valueStart, i).trim();
    }

    if (key === "label" || key === "name" || key === "text") {
      label = parsedValue;
    } else if (key === "value" || key === "id" || key === "key") {
      value = parsedValue;
    } else if (!label && parsedValue) {
      // tolerate `{value:"x", "Label text"}` style by treating unknown later
      bareStrings.push(parsedValue);
    }
  }

  if (!label && bareStrings.length > 0) {
    label = bareStrings[bareStrings.length - 1] ?? "";
  }
  if (!value && bareStrings.length > 1) {
    value = bareStrings[0] ?? "";
  }
  if (!label && value) label = value;
  if (!value && label) value = optionValue(label);
  if (!label || !value) return null;
  return { label, value };
}

export function parseOptionsArray(raw: string): FormFieldOption[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return [];
  const end = findBalancedEnd(trimmed, 0, "[", "]");
  if (end < 0) return [];
  const inner = trimmed.slice(1, end).trim();
  if (!inner) return [];

  const options: FormFieldOption[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i] ?? "")) i += 1;
    if (i >= inner.length) break;

    // Skip numeric indexes like `1:` from authoring drafts.
    if (/[0-9]/.test(inner[i] ?? "")) {
      while (i < inner.length && /[0-9]/.test(inner[i] ?? "")) i += 1;
      while (i < inner.length && /\s/.test(inner[i] ?? "")) i += 1;
      if (inner[i] === ":") {
        i += 1;
        continue;
      }
    }

    if (inner[i] === '{') {
      const objEnd = findBalancedEnd(inner, i, "{", "}");
      if (objEnd < 0) break;
      const option = parseOptionObject(inner.slice(i, objEnd + 1));
      if (option) options.push(option);
      i = objEnd + 1;
      continue;
    }

    if (inner[i] === '"') {
      const quoted = readQuotedString(inner, i);
      if (!quoted) break;
      options.push({
        label: quoted.value,
        value: optionValue(quoted.value),
      });
      i = quoted.end;
      continue;
    }

    const start = i;
    while (i < inner.length && inner[i] !== ",") i += 1;
    const label = inner.slice(start, i).trim();
    if (label) {
      options.push({ label, value: optionValue(label) });
    }
  }

  return options;
}

function extractOptionsFromAttrs(raw: string): {
  options: FormFieldOption[];
  attrs: string;
} {
  const optionsKey = /(?:^|[,{])\s*options\s*:/i;
  const match = optionsKey.exec(`{${raw}}`);
  if (!match) {
    return { options: [], attrs: raw };
  }

  // Locate options: inside the original raw string.
  const local = raw.search(/\boptions\s*:/i);
  if (local < 0) return { options: [], attrs: raw };
  let i = local + raw.slice(local).search(/:/) + 1;
  while (i < raw.length && /\s/.test(raw[i] ?? "")) i += 1;
  if (raw[i] !== "[") return { options: [], attrs: raw };

  const end = findBalancedEnd(raw, i, "[", "]");
  if (end < 0) return { options: [], attrs: raw };

  const options = parseOptionsArray(raw.slice(i, end + 1));
  const before = raw.slice(0, local).replace(/,\s*$/, "");
  const after = raw.slice(end + 1).replace(/^\s*,/, "");
  const attrs = [before, after]
    .map((part) => part.trim().replace(/^,|,$/g, "").trim())
    .filter(Boolean)
    .join(",");
  return { options, attrs };
}

export function parseAttrBlock(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i] ?? "")) i += 1;
    if (i >= raw.length) break;

    const keyStart = i;
    while (i < raw.length && /[a-zA-Z0-9_]/.test(raw[i] ?? "")) i += 1;
    const key = raw.slice(keyStart, i);
    while (i < raw.length && /\s/.test(raw[i] ?? "")) i += 1;
    if ((raw[i] ?? "") !== ":") continue;
    i += 1;
    while (i < raw.length && /\s/.test(raw[i] ?? "")) i += 1;

    // Skip nested arrays/objects — handled by extractOptionsFromAttrs.
    if (raw[i] === "[") {
      const end = findBalancedEnd(raw, i, "[", "]");
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (raw[i] === "{") {
      const end = findBalancedEnd(raw, i, "{", "}");
      if (end < 0) break;
      i = end + 1;
      continue;
    }

    let value = "";
    if ((raw[i] ?? "") === '"') {
      const quoted = readQuotedString(raw, i);
      if (!quoted) break;
      value = quoted.value;
      i = quoted.end;
    } else {
      const valueStart = i;
      while (i < raw.length && raw[i] !== ",") i += 1;
      value = raw.slice(valueStart, i).trim();
    }

    if (key) result[key] = value;
  }

  return result;
}

function parseBooleanAttr(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on", "required"].includes(value.toLowerCase());
}

function consumePropertyBlocks(rest: string): {
  options: FormFieldOption[];
  attrs: Record<string, string>;
  rest: string;
} {
  let cursor = rest;
  let options: FormFieldOption[] = [];
  const attrs: Record<string, string> = {};

  while (cursor.startsWith(":{")) {
    const end = findBalancedEnd(cursor, 1, "{", "}");
    if (end < 0) break;
    const body = cursor.slice(2, end);
    const extracted = extractOptionsFromAttrs(body);
    if (extracted.options.length > 0) {
      options = extracted.options;
    }
    Object.assign(attrs, parseAttrBlock(extracted.attrs));
    cursor = cursor.slice(end + 1);
  }

  return { options, attrs, rest: cursor };
}

export function parseMarkdownFieldToken(
  token: string,
): ParsedMarkdownFieldToken | null {
  const header = token.match(
    new RegExp(
      `^#!\\[(${FIELD_TYPE_PATTERN}):\\{([a-z][a-z0-9_]*)\\}`,
      "i",
    ),
  );
  if (!header || !token.endsWith("]")) return null;

  const rest = token.slice(header[0].length, -1);
  let placeholder = "";
  let style: FormFieldStyle = "default";
  /** Unset size keeps fill-the-line behavior for existing markdown layouts. */
  let width: FormFieldWidth = "full-width";
  let required = false;
  let helpText = "";
  let maxLength = 0;

  const blocks = consumePropertyBlocks(rest);
  if (blocks.rest.trim()) {
    // Only property blocks (`:{...}`) are allowed after the field name.
    return null;
  }

  const options = blocks.options;
  const attrs = blocks.attrs;

  if (
    attrs.style &&
    (FORM_FIELD_STYLES as readonly string[]).includes(attrs.style)
  ) {
    style = attrs.style as FormFieldStyle;
  }
  const rawSize = attrs.size ?? attrs.width;
  if (rawSize) {
    width = normalizeFormFieldWidth(rawSize);
  }
  required = parseBooleanAttr(attrs.required);
  helpText = (attrs.suggestion ?? attrs.help ?? "").trim();
  placeholder = (attrs.placeholder ?? "").trim();
  const rawMax = attrs.maxLength ?? attrs.max ?? "";
  const parsedMax = Number.parseInt(rawMax, 10);
  if (Number.isFinite(parsedMax) && parsedMax > 0) {
    maxLength = Math.min(parsedMax, MAX_TEXT);
  }

  const type = header[1]!.toLowerCase() as FormFieldType;
  if (
    (type === "select" || type === "radio") &&
    options.length === 0
  ) {
    return null;
  }

  return {
    type,
    name: header[2] ?? "",
    options,
    placeholder,
    style,
    width,
    required,
    helpText,
    maxLength,
  };
}

export function makeFormFieldId(): string {
  return `fld_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyFormField(
  type: FormFieldType = "text",
): FormFieldDefinition {
  return {
    id: makeFormFieldId(),
    type,
    name: "",
    label: "",
    required: false,
    placeholder: "",
    helpText: "",
    maxLength: 0,
    width: "default",
    style: "default",
    options:
      type === "select" || type === "radio"
        ? [{ label: "Option 1", value: "option-1" }]
        : [],
  };
}

export function parseFormSchemaMarkdown(markdown: string): {
  ok: true;
  fields: FormFieldDefinition[];
} | {
  ok: false;
  error: string;
} {
  const grouped = new Map<string, FormFieldDefinition>();
  const trimmed = markdown.trim();

  if (!trimmed) {
    return { ok: false, error: "Markdown schema is empty" };
  }

  const tokens: ParsedMarkdownFieldToken[] = [];
  for (const match of scanMarkdownFieldTokens(trimmed)) {
    const parsedToken = parseMarkdownFieldToken(match.raw);
    if (!parsedToken) {
      return {
        ok: false,
        error: `Invalid field placeholder: ${match.raw}`,
      };
    }
    tokens.push(parsedToken);
  }

  if (tokens.length === 0) {
    return {
      ok: false,
      error: "Markdown layout needs at least one #![...] field placeholder",
    };
  }

  for (const parsedLine of tokens) {
    const rawType = parsedLine.type;
    const name = parsedLine.name;
    const key = `${rawType}:${name}`;

    if (grouped.has(key)) {
      return {
        ok: false,
        error: `Duplicate field ${name} in markdown placeholders`,
      };
    }

    if (
      (rawType === "select" || rawType === "radio") &&
      parsedLine.options.length === 0
    ) {
      return {
        ok: false,
        error: `Field ${name} needs options:[{value,label},…]`,
      };
    }

    grouped.set(key, {
      id: makeFormFieldId(),
      type: rawType,
      name,
      label: name.replace(/_/g, " "),
      required: parsedLine.required,
      placeholder: parsedLine.placeholder,
      helpText: parsedLine.helpText,
      maxLength:
        rawType === "text" || rawType === "textarea" ? parsedLine.maxLength : 0,
      width: parsedLine.width,
      style: parsedLine.style,
      options: parsedLine.options,
    });
  }

  const fields = [...grouped.values()].map((field) => ({
    ...field,
    label:
      field.label
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase()) || field.name,
  }));

  const parsed = z.array(formFieldSchema).safeParse(fields);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid markdown schema",
    };
  }

  return { ok: true, fields: parsed.data };
}

function allowedOptions(field: FormFieldDefinition): Set<string> {
  return new Set((field.options ?? []).map((option) => option.value));
}

export type FormFieldErrorMessages = {
  required: (label: string) => string;
  invalidSelection: (label: string) => string;
  invalidUpload: (label: string) => string;
  invalidUploadKey: (label: string) => string;
  maxLength: (label: string, max: number) => string;
  invalidEmail: (label: string) => string;
  invalidPhone: (label: string) => string;
  invalidDate: (label: string) => string;
  invalidDateTime: (label: string) => string;
};

const defaultFieldErrorMessages: FormFieldErrorMessages = {
  required: (label) => `${label} is required`,
  invalidSelection: (label) => `${label} has an invalid selection`,
  invalidUpload: (label) => `${label} must be a valid uploaded file`,
  invalidUploadKey: (label) => `${label} has an invalid upload`,
  maxLength: (label, max) => `${label} must be at most ${max} characters`,
  invalidEmail: (label) => `${label} must be a valid email`,
  invalidPhone: (label) => `${label} must be a valid phone number`,
  invalidDate: (label) => `${label} must be a valid date`,
  invalidDateTime: (label) => `${label} must be a valid date and time`,
};

export function validateSubmissionPayload(
  fields: FormFieldDefinition[],
  input: Record<string, unknown>,
  messages: FormFieldErrorMessages = defaultFieldErrorMessages,
): {
  ok: true;
  data: Record<string, FormSubmissionValue>;
} | {
  ok: false;
  error: string;
  fieldName: string;
} {
  const payload: Record<string, FormSubmissionValue> = {};

  for (const field of fields) {
    const raw = input[field.name];

    if (field.type === "checkbox") {
      if (field.options.length > 0) {
        const values = Array.isArray(raw)
          ? raw.map((item) => String(item).trim()).filter(Boolean)
          : typeof raw === "string"
            ? [raw.trim()].filter(Boolean)
            : [];
        const allowed = allowedOptions(field);
        if (values.some((value) => !allowed.has(value))) {
          return {
            ok: false,
            error: messages.invalidSelection(field.label),
            fieldName: field.name,
          };
        }
        if (field.required && values.length === 0) {
          return {
            ok: false,
            error: messages.required(field.label),
            fieldName: field.name,
          };
        }
        payload[field.name] = values;
        continue;
      }
      const checked =
        raw === true ||
        raw === "true" ||
        raw === "on" ||
        raw === "1" ||
        raw === 1;
      if (field.required && !checked) {
        return {
          ok: false,
          error: messages.required(field.label),
          fieldName: field.name,
        };
      }
      payload[field.name] = checked;
      continue;
    }

    if (field.type === "image" || field.type === "file") {
      if (raw == null || raw === "") {
        if (field.required) {
          return {
            ok: false,
            error: messages.required(field.label),
            fieldName: field.name,
          };
        }
        payload[field.name] = "";
        continue;
      }

      const parsedUpload = formUploadValueSchema.safeParse(raw);
      if (!parsedUpload.success) {
        return {
          ok: false,
          error: messages.invalidUpload(field.label),
          fieldName: field.name,
        };
      }

      const upload = parsedUpload.data;
      if (!upload.key.startsWith("form-uploads/")) {
        return {
          ok: false,
          error: messages.invalidUploadKey(field.label),
          fieldName: field.name,
        };
      }

      payload[field.name] = upload;
      continue;
    }

    const value =
      typeof raw === "string"
        ? raw.trim()
        : raw == null
          ? ""
          : String(raw).trim();

    if (field.required && !value) {
      return {
        ok: false,
        error: messages.required(field.label),
        fieldName: field.name,
      };
    }

    if (!value) {
      payload[field.name] = "";
      continue;
    }

    if (
      (field.type === "text" || field.type === "textarea") &&
      field.maxLength > 0 &&
      value.length > field.maxLength
    ) {
      return {
        ok: false,
        error: messages.maxLength(field.label, field.maxLength),
        fieldName: field.name,
      };
    }

    if (field.type === "email") {
      const parsed = z.string().email().safeParse(value);
      if (!parsed.success) {
        return {
          ok: false,
          error: messages.invalidEmail(field.label),
          fieldName: field.name,
        };
      }
    }

    if (field.type === "phone") {
      const parsed = z
        .string()
        .regex(/^[+\d()[\]\s.-]{6,30}$/)
        .safeParse(value);
      if (!parsed.success) {
        return {
          ok: false,
          error: messages.invalidPhone(field.label),
          fieldName: field.name,
        };
      }
    }

    if (field.type === "date") {
      const parsed = z.string().date().safeParse(value);
      if (!parsed.success) {
        return {
          ok: false,
          error: messages.invalidDate(field.label),
          fieldName: field.name,
        };
      }
    }

    if (field.type === "date_time") {
      const parsed = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
        .safeParse(value);
      if (!parsed.success || Number.isNaN(Date.parse(value))) {
        return {
          ok: false,
          error: messages.invalidDateTime(field.label),
          fieldName: field.name,
        };
      }
    }

    if (field.type === "select" || field.type === "radio") {
      if (!allowedOptions(field).has(value)) {
        return {
          ok: false,
          error: messages.invalidSelection(field.label),
          fieldName: field.name,
        };
      }
    }

    payload[field.name] = value;
  }

  return { ok: true, data: payload };
}

/** Collect every invalid field (used to highlight all errors on submit). */
export function collectSubmissionFieldErrors(
  fields: FormFieldDefinition[],
  input: Record<string, unknown>,
  messages?: FormFieldErrorMessages,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const result = validateSubmissionPayload([field], input, messages);
    if (!result.ok) {
      errors[field.name] = result.error;
    }
  }
  return errors;
}

export const emptyFormLocale: FormLocaleValues = {
  name: "",
  description: "",
  submitLabel: "",
  successMessage: "",
  schemaMarkdown: "",
  fields: [],
};

export const emptyFormDefinitionForm: FormDefinitionFormValues = {
  status: "draft",
  definitionMode: "fields",
  locales: {
    vi: {
      name: "",
      description: "",
      submitLabel: "Gửi",
      successMessage: "Cảm ơn bạn. Chúng tôi đã nhận được thông tin.",
      schemaMarkdown: "",
      fields: [],
    },
    en: {
      name: "",
      description: "",
      submitLabel: "Send",
      successMessage: "Thank you. Your submission has been received.",
      schemaMarkdown: "",
      fields: [],
    },
  },
};
