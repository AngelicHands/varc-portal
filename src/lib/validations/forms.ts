import { z } from "zod";

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
  "image",
  "file",
] as const;

export const FORM_FIELD_WIDTHS = ["full", "half"] as const;
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
    width: z.enum(FORM_FIELD_WIDTHS).default("full"),
    style: z.enum(FORM_FIELD_STYLES).default("default"),
    options: z.array(formFieldOptionSchema).max(100).default([]),
  })
  .superRefine((field, ctx) => {
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

export const formDefinitionFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(MAX_TEXT).default(""),
    status: z.enum(["draft", "published"]),
    submitLabel: z.string().trim().min(1, "Submit label is required").max(120),
    successMessage: z
      .string()
      .trim()
      .min(1, "Success message is required")
      .max(MAX_TEXT),
    schemaMarkdown: z.string().max(MAX_MARKDOWN).default(""),
    fields: z.array(formFieldSchema).max(100).default([]),
  })
  .superRefine((data, ctx) => {
    const hasMarkdown = data.schemaMarkdown.trim().length > 0;
    const hasFields = data.fields.length > 0;

    if (!hasMarkdown && !hasFields) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either markdown schema or at least one field",
        path: ["schemaMarkdown"],
      });
      return;
    }

    if (hasMarkdown) {
      const parsed = parseFormSchemaMarkdown(data.schemaMarkdown);
      if (!parsed.ok) {
        ctx.addIssue({
          code: "custom",
          message: parsed.error,
          path: ["schemaMarkdown"],
        });
      }
    }

    const names = new Set<string>();
    for (const [index, field] of data.fields.entries()) {
      if (names.has(field.name)) {
        ctx.addIssue({
          code: "custom",
          message: "Field keys must be unique",
          path: ["fields", index, "name"],
        });
      }
      names.add(field.name);
    }

    if (data.status === "published" && !hasMarkdown && data.fields.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Published forms need at least one field",
        path: ["fields"],
      });
    }
  })
  .transform((data) => {
    const markdown = data.schemaMarkdown.trim();
    if (!markdown) {
      return {
        ...data,
        schemaMarkdown: "",
      };
    }
    const parsed = parseFormSchemaMarkdown(markdown);
    if (!parsed.ok) return data;
    return {
      ...data,
      schemaMarkdown: markdown,
      fields: parsed.fields,
    };
  });

export type FormDefinitionFormValues = z.input<typeof formDefinitionFormSchema>;

export const FORM_SUBMISSION_STATUSES = ["new", "reviewed", "archived"] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

const FIELD_TYPE_PATTERN =
  "text|textarea|email|phone|select|checkbox|radio|date|image|file";

export const MARKDOWN_FIELD_TOKEN_RE = new RegExp(
  `#!\\[(${FIELD_TYPE_PATTERN}):\\{([a-z][a-z0-9_]*)\\}([^\\]]*)\\]`,
  "gi",
);

export type ParsedMarkdownFieldToken = {
  type: FormFieldType;
  name: string;
  optionOrLabel: string;
  placeholder: string;
  style: FormFieldStyle;
  required: boolean;
  helpText: string;
};

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

    let value = "";
    if ((raw[i] ?? "") === '"') {
      i += 1;
      let escaped = false;
      while (i < raw.length) {
        const ch = raw[i] ?? "";
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
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
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

export function parseMarkdownFieldToken(
  token: string,
): ParsedMarkdownFieldToken | null {
  const match = token.match(
    new RegExp(
      `^#!\\[(${FIELD_TYPE_PATTERN}):\\{([a-z][a-z0-9_]*)\\}([^\\]]*)\\]$`,
      "i",
    ),
  );
  if (!match) return null;

  let rest = match[3] ?? "";
  let optionOrLabel = "";
  let placeholder = "";
  let style: FormFieldStyle = "default";
  let required = false;
  let helpText = "";

  if (rest.startsWith("-")) {
    const nextPlaceholder = rest.indexOf(':"');
    const nextStyle = rest.indexOf(":{");
    const cutIndices = [nextPlaceholder, nextStyle]
      .filter((value) => value >= 0)
      .sort((a, b) => a - b);
    const cut = cutIndices[0] ?? rest.length;
    optionOrLabel = rest.slice(1, cut).trim();
    rest = rest.slice(cut);
  }

  const placeholderMatch = rest.match(/^:"([^"]*)"(.*)$/);
  if (placeholderMatch) {
    placeholder = placeholderMatch[1] ?? "";
    rest = placeholderMatch[2] ?? "";
  }

  const attrsMatch = rest.match(/^:\{([\s\S]*)\}(.*)$/);
  if (attrsMatch) {
    const attrs = parseAttrBlock(attrsMatch[1] ?? "");
    if (
      attrs.style &&
      (FORM_FIELD_STYLES as readonly string[]).includes(attrs.style)
    ) {
      style = attrs.style as FormFieldStyle;
    }
    required = parseBooleanAttr(attrs.required);
    helpText = (attrs.suggestion ?? attrs.help ?? "").trim();
  }

  return {
    type: match[1].toLowerCase() as FormFieldType,
    name: match[2] ?? "",
    optionOrLabel,
    placeholder,
    style,
    required,
    helpText,
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
    width: "full",
    style: "default",
    options:
      type === "select" || type === "radio"
        ? [{ label: "Option 1", value: "option-1" }]
        : [],
  };
}

function optionValue(label: string) {
  const normalized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "option";
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

  const tokenRe = new RegExp(MARKDOWN_FIELD_TOKEN_RE.source, "gi");
  const tokens: ParsedMarkdownFieldToken[] = [];
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(trimmed)) !== null) {
    const raw = match[0] ?? "";
    const parsedToken = parseMarkdownFieldToken(raw);
    if (!parsedToken) {
      return {
        ok: false,
        error: `Invalid field placeholder: ${raw}`,
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
    const optionOrLabel = parsedLine.optionOrLabel;
    const placeholder = parsedLine.placeholder;
    const style = parsedLine.style;
    const required = parsedLine.required;
    const helpText = parsedLine.helpText;
    const key = `${rawType}:${name}`;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        id: makeFormFieldId(),
        type: rawType,
        name,
        label: optionOrLabel || name.replace(/_/g, " "),
        required,
        placeholder:
          placeholder ||
          (rawType === "checkbox" && optionOrLabel ? optionOrLabel : ""),
        helpText,
        width: "full",
        style,
        options:
          rawType === "select" || rawType === "radio"
            ? optionOrLabel
              ? [{ label: optionOrLabel, value: optionValue(optionOrLabel) }]
              : []
            : rawType === "checkbox" && optionOrLabel
              ? [{ label: optionOrLabel, value: optionValue(optionOrLabel) }]
              : [],
      });
      continue;
    }

    if (
      rawType !== "select" &&
      rawType !== "radio" &&
      rawType !== "checkbox"
    ) {
      return {
        ok: false,
        error: `Duplicate field ${name} in markdown placeholders`,
      };
    }

    if (!optionOrLabel) {
      return {
        ok: false,
        error: `Field ${name} needs an option label in its placeholder`,
      };
    }

    existing.options = [
      ...existing.options,
      { label: optionOrLabel, value: optionValue(optionOrLabel) },
    ];
    if (required) existing.required = true;
    if (helpText && !existing.helpText.trim()) {
      existing.helpText = helpText;
    }
  }

  const fields = [...grouped.values()].map((field) => ({
    ...field,
    label:
      field.label
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase()) || field.name,
    placeholder:
      field.type === "checkbox" && field.options.length > 0 ? "" : field.placeholder,
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

export function validateSubmissionPayload(
  fields: FormFieldDefinition[],
  input: Record<string, unknown>,
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
            error: `${field.label} has an invalid selection`,
            fieldName: field.name,
          };
        }
        if (field.required && values.length === 0) {
          return {
            ok: false,
            error: `${field.label} is required`,
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
          error: `${field.label} is required`,
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
            error: `${field.label} is required`,
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
          error: `${field.label} must be a valid uploaded file`,
          fieldName: field.name,
        };
      }

      const upload = parsedUpload.data;
      if (!upload.key.startsWith("form-uploads/")) {
        return {
          ok: false,
          error: `${field.label} has an invalid upload`,
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
        error: `${field.label} is required`,
        fieldName: field.name,
      };
    }

    if (!value) {
      payload[field.name] = "";
      continue;
    }

    if (field.type === "email") {
      const parsed = z.string().email().safeParse(value);
      if (!parsed.success) {
        return {
          ok: false,
          error: `${field.label} must be a valid email`,
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
          error: `${field.label} must be a valid phone number`,
          fieldName: field.name,
        };
      }
    }

    if (field.type === "date") {
      const parsed = z.string().date().safeParse(value);
      if (!parsed.success) {
        return {
          ok: false,
          error: `${field.label} must be a valid date`,
          fieldName: field.name,
        };
      }
    }

    if (field.type === "select" || field.type === "radio") {
      if (!allowedOptions(field).has(value)) {
        return {
          ok: false,
          error: `${field.label} has an invalid selection`,
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
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const result = validateSubmissionPayload([field], input);
    if (!result.ok) {
      errors[field.name] = result.error;
    }
  }
  return errors;
}

export const emptyFormDefinitionForm: FormDefinitionFormValues = {
  name: "",
  description: "",
  status: "draft",
  submitLabel: "Send",
  successMessage: "Thank you. Your submission has been received.",
  schemaMarkdown: "",
  fields: [],
};
