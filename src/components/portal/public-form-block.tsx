"use client";

import {
  Children,
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { PublicFormDefinition, PublicFormField } from "@/lib/forms";
import {
  FORM_FIELD_LINK_PREFIX,
  formStepFontStyle,
  preprocessFormSchemaMarkdown,
  remarkDisableIndentedCode,
  splitFormMarkdownSteps,
  type FormMarkdownToken,
} from "@/lib/form-markdown";
import {
  fileExtensionFromName,
  FORM_UPLOAD_FILE_MIME,
  FORM_UPLOAD_IMAGE_MIME,
  FORM_UPLOAD_MAX_BYTES,
  matchesAllowedUploadExtension,
  collectSubmissionFieldErrors,
  dateFormatPlaceholder,
  dateTimeFormatPlaceholder,
  defaultSubmissionValue,
  isFormUploadValue,
  timeFormatPlaceholder,
  usesNativeDateInput,
  usesNativeTimeInput,
  type FormFieldErrorMessages,
  type FormFieldTypingStyle,
  type FormFieldTypingAlignment,
  type FormFieldWidth,
  type FormSubmissionValue,
  type FormUploadValue,
} from "@/lib/validations/forms";

type Props = {
  form: PublicFormDefinition;
  /** Admin draft preview — no real submit/upload. */
  preview?: boolean;
};

type SubmitState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function allowFormFieldUrl(url: string) {
  if (url.startsWith(FORM_FIELD_LINK_PREFIX)) return url;
  return defaultUrlTransform(url);
}

function fieldClass(width: FormFieldWidth) {
  return width === "default" || width === "medium"
    ? "md:col-span-1"
    : "md:col-span-2";
}

function inputSizeClass(width: FormFieldWidth) {
  if (width === "medium") return "w-64 max-w-full";
  if (width === "wide") return "w-full max-w-xl";
  if (width === "full-width") return "w-full max-w-full";
  return "w-40 max-w-full";
}

function inputStyleClass(style: string, invalid = false) {
  const invalidClass = invalid
    ? " border-red-500 ring-2 ring-red-400 focus:border-red-600 focus:ring-red-400"
    : "";
  if (style === "borderless") {
    return `border-transparent bg-transparent px-0 shadow-none focus:border-transparent${invalid ? " ring-2 ring-red-400" : ""}`;
  }
  if (style === "underline") {
    return `rounded-none border-x-0 border-t-0 border-b border-gray-400 bg-transparent px-0 focus:border-gray-900${invalidClass}`;
  }
  if (style === "dotted_underline") {
    return `rounded-none border-x-0 border-t-0 border-b border-dotted border-gray-400 bg-transparent px-0 focus:border-gray-900${invalidClass}`;
  }
  return `rounded border border-gray-300 bg-white px-3 py-1.5 focus:border-gray-900${invalidClass}`;
}

function inputTypingStyleClass(typingStyle: FormFieldTypingStyle[] = []) {
  const classes: string[] = [];
  if (typingStyle.includes("bold")) classes.push("font-bold");
  if (typingStyle.includes("italic")) classes.push("italic");
  if (typingStyle.includes("underline")) classes.push("underline");
  if (typingStyle.includes("strikethrough")) classes.push("line-through");
  return classes.join(" ");
}

function inputTypingAlignmentClass(
  alignment: FormFieldTypingAlignment = "left",
) {
  if (alignment === "center") return "text-center";
  if (alignment === "right") return "text-right";
  return "text-left";
}

function inputTypingClass(field: {
  typingStyle?: FormFieldTypingStyle[];
  typingAlignment?: FormFieldTypingAlignment;
}) {
  const classes = [
    inputTypingStyleClass(field.typingStyle),
    inputTypingAlignmentClass(field.typingAlignment),
  ].filter(Boolean);
  return classes.join(" ");
}

function uploadAcceptValue(field: PublicFormField) {
  if (field.allowedExtensions.length > 0) {
    return field.allowedExtensions.join(",");
  }
  return field.type === "image"
    ? FORM_UPLOAD_IMAGE_MIME.join(",")
    : FORM_UPLOAD_FILE_MIME.join(",");
}

function uploadExtensionError(field: PublicFormField, fileName: string) {
  const extension = fileExtensionFromName(fileName);
  if (!extension || field.allowedExtensions.length === 0) {
    return "This file type is not allowed.";
  }
  return `Only these file extensions are allowed: ${field.allowedExtensions.join(", ")}`;
}

function FieldSuggestionIcon({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-semibold leading-none text-gray-600 hover:border-gray-700 hover:text-gray-900"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-left text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

function FormUploadControl({
  formId,
  field,
  value,
  onChange,
  compact = false,
  showSuggestion = true,
  invalid = false,
  preview = false,
}: {
  formId: string;
  field: PublicFormField;
  value: FormSubmissionValue;
  onChange: (next: FormSubmissionValue) => void;
  compact?: boolean;
  showSuggestion?: boolean;
  invalid?: boolean;
  preview?: boolean;
}) {
  const t = useTranslations("form");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = isFormUploadValue(value) ? value : null;
  const accept = uploadAcceptValue(field);

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setError(null);

    if (!matchesAllowedUploadExtension(file.name, field.allowedExtensions)) {
      setError(uploadExtensionError(field, file.name));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size <= 0 || file.size > FORM_UPLOAD_MAX_BYTES) {
      setError(
        t("fileTooLarge", {
          mb: Math.floor(FORM_UPLOAD_MAX_BYTES / (1024 * 1024)),
        }),
      );
      return;
    }

    if (preview) {
      onChange({
        url: URL.createObjectURL(file),
        key: `preview/${field.name}/${file.name}`,
        originalName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.set("field", field.name);
      body.set("file", file);
      const res = await fetch(`/api/forms/${formId}/upload`, {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as
        | (FormUploadValue & { ok?: boolean; error?: string })
        | null;
      if (!res.ok || !json?.ok || !json.url || !json.key) {
        setError(json?.error || t("uploadFailed"));
        return;
      }
      onChange({
        url: json.url,
        key: json.key,
        originalName: json.originalName,
        contentType: json.contentType,
        size: json.size,
      });
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <span
      className={
        compact
          ? `inline-flex flex-col gap-1 align-middle${invalid ? " rounded ring-2 ring-red-400" : ""}`
          : `block space-y-2${invalid ? " rounded ring-2 ring-red-400 p-2" : ""}`
      }
    >
      <span className="inline-flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          required={false}
          aria-required={field.required}
          disabled={uploading}
          aria-invalid={invalid}
          onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          className="max-w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
        />
        <FieldSuggestionIcon text={showSuggestion ? field.helpText : ""} />
        {field.required && compact ? (
          <span className="text-xs text-red-600">*</span>
        ) : null}
      </span>
      {uploading ? (
        <span className="text-xs text-muted">{t("uploading")}</span>
      ) : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      {upload ? (
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {field.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={upload.url}
              alt={upload.originalName}
              className="h-16 w-16 rounded border border-gray-200 object-cover"
            />
          ) : null}
          <a
            href={upload.url}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {upload.originalName}
          </a>
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-red-600 underline"
          >
            {t("remove")}
          </button>
        </span>
      ) : null}
    </span>
  );
}

type FieldRenderContext = {
  formId: string;
  preview: boolean;
  fieldsByName: Map<string, PublicFormField>;
  values: Record<string, FormSubmissionValue>;
  setValues: React.Dispatch<
    React.SetStateAction<Record<string, FormSubmissionValue>>
  >;
  tokensByIndex: Map<number, FormMarkdownToken>;
  /** First markdown token index for each field name (stable, no render mutation). */
  firstTokenIndexByName: Map<string, number>;
  fieldErrors: Record<string, string>;
  clearFieldError: (name: string) => void;
  toggleCheckboxGroup: (
    name: string,
    optionValue: string,
    checked: boolean,
  ) => void;
  selectPlaceholder: string;
};

const FormFieldRenderContext = createContext<FieldRenderContext | null>(null);

function useFormFieldRenderContext() {
  const ctx = useContext(FormFieldRenderContext);
  if (!ctx) {
    throw new Error("Form field render context is missing");
  }
  return ctx;
}

/** Stable markdown components — inline factories remount inputs on every keystroke. */
function FormMarkdownParagraph({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="form-md-p my-[1em] min-w-0">
      {children}
    </div>
  );
}

/** Drop whitespace-only text nodes so list markers stay on the label line. */
function FormMarkdownListItem({
  children,
  ...props
}: ComponentPropsWithoutRef<"li">) {
  const cleaned = Children.toArray(children).filter((child) => {
    if (typeof child === "string") return child.trim().length > 0;
    return true;
  });
  return <li {...props}>{cleaned}</li>;
}

/** Keep markdown list numbers (e.g. `9. abc` → start at 9, not reset to 1). */
function FormMarkdownOrderedList({
  start,
  children,
  style,
  ...props
}: ComponentPropsWithoutRef<"ol">) {
  const startNum = Math.max(1, Number(start) || 1);
  return (
    <ol
      {...props}
      start={startNum}
      style={{
        ...style,
        // Custom ::before markers ignore native start; seed the CSS counter.
        counterReset: `prose-ol ${startNum - 1}`,
      }}
    >
      {children}
    </ol>
  );
}

function FormMarkdownFieldImage({ src }: { src?: string | Blob }) {
  const ctx = useFormFieldRenderContext();
  if (typeof src !== "string" || !src.startsWith(FORM_FIELD_LINK_PREFIX)) {
    return null;
  }
  const tokenIndex = Number.parseInt(
    src.slice(FORM_FIELD_LINK_PREFIX.length),
    10,
  );
  if (Number.isNaN(tokenIndex)) return null;
  const token = ctx.tokensByIndex.get(tokenIndex);
  const field = token ? ctx.fieldsByName.get(token.name) : null;
  const fill =
    field != null &&
    isFillWidthFieldType(field.type) &&
    field.width === "full-width";
  const sized =
    field != null &&
    isFillWidthFieldType(field.type) &&
    field.width !== "full-width";
  const block = field?.type === "textarea";
  return (
    <span
      className={
        block
          ? "not-prose form-field-block"
          : fill
            ? "not-prose form-field-slot"
            : sized
              ? "not-prose form-field-sized"
              : "not-prose form-field-inline"
      }
    >
      {renderFormFieldToken(tokenIndex, ctx)}
    </span>
  );
}

function FormMarkdownChoiceInput({
  type,
  checked,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  if (type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        readOnly
        className="form-choice-input"
        {...props}
      />
    );
  }
  return <input type={type} checked={checked} {...props} />;
}

const formMarkdownComponents = {
  // Avoid <p> wrapping fields — invalid nesting with controls breaks hydration.
  p: FormMarkdownParagraph,
  li: FormMarkdownListItem,
  ol: FormMarkdownOrderedList,
  img: FormMarkdownFieldImage,
  input: FormMarkdownChoiceInput,
};

function withSuggestion(
  field: PublicFormField,
  control: React.ReactNode,
  options?: { inline?: boolean; showMeta?: boolean; fill?: boolean },
) {
  const inline = options?.inline ?? true;
  const showMeta = options?.showMeta ?? true;
  const fill = options?.fill ?? false;
  const showFieldMeta =
    showMeta && field.type !== "image" && field.type !== "file";
  const meta = showFieldMeta ? (
    <>
      {field.required ? (
        <span className="shrink-0 text-xs text-red-600">*</span>
      ) : null}
      <FieldSuggestionIcon text={field.helpText} />
    </>
  ) : null;

  // Block controls (textarea): keep * / help in the label line, control below.
  if (!inline && !fill) {
    return (
      <>
        {meta}
        {control}
      </>
    );
  }

  return (
    <span
      className={
        fill
          ? "flex w-full min-w-0 items-center gap-1"
          : "inline-flex items-center gap-1 align-middle"
      }
    >
      {meta}
      {control}
    </span>
  );
}

function isFillWidthFieldType(type: PublicFormField["type"]) {
  return (
    type === "text" ||
    type === "email" ||
    type === "phone" ||
    type === "date" ||
    type === "time" ||
    type === "date_time" ||
    type === "select"
  );
}

function dateTimeInputType(field: PublicFormField): string {
  if (field.type === "date") {
    return usesNativeDateInput(field.dateFormat) ? "date" : "text";
  }
  if (field.type === "time") {
    return usesNativeTimeInput(field.timeFormat) ? "time" : "text";
  }
  if (field.type === "date_time") {
    return usesNativeDateInput(field.dateFormat) &&
      usesNativeTimeInput(field.timeFormat)
      ? "datetime-local"
      : "text";
  }
  if (field.type === "email") return "email";
  if (field.type === "phone") return "tel";
  return "text";
}

function dateTimePlaceholder(field: PublicFormField): string {
  if (field.placeholder.trim()) return field.placeholder;
  if (field.type === "date") return dateFormatPlaceholder(field.dateFormat);
  if (field.type === "time") return timeFormatPlaceholder(field.timeFormat);
  if (field.type === "date_time") {
    return dateTimeFormatPlaceholder(field.dateFormat, field.timeFormat);
  }
  return "";
}

function renderFormFieldToken(
  tokenIndex: number,
  ctx: FieldRenderContext,
): React.ReactNode {
  const token = ctx.tokensByIndex.get(tokenIndex);
  if (!token) return null;

  const field = ctx.fieldsByName.get(token.name);
  if (!field) return null;

  const value = ctx.values[field.name];
  const invalid = Boolean(ctx.fieldErrors[field.name]);
  const sizeClass = inputSizeClass(field.width);
  const typingClass = inputTypingClass(field);
  const inputClass = `text-sm outline-none transition ${inputStyleClass(field.style, invalid)}${typingClass ? ` ${typingClass}` : ""}`;
  const isFirstTokenForField =
    ctx.firstTokenIndexByName.get(field.name) === tokenIndex;
  const showHint = isFirstTokenForField;
  const fillRemaining = field.width === "full-width";

  if (field.type === "image" || field.type === "file") {
    return (
      <FormUploadControl
        formId={ctx.formId}
        field={field}
        value={value}
        compact
        invalid={invalid}
        preview={ctx.preview}
        onChange={(next) => {
          ctx.clearFieldError(field.name);
          ctx.setValues((prev) => ({
            ...prev,
            [field.name]: next,
          }));
        }}
      />
    );
  }

  if (field.type === "select") {
    if (!isFirstTokenForField) return null;
    return withSuggestion(
      field,
      <select
        aria-required={field.required}
        aria-invalid={invalid}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => {
          ctx.clearFieldError(field.name);
          ctx.setValues((prev) => ({
            ...prev,
            [field.name]: e.target.value,
          }));
        }}
        className={`${inputClass} my-1 ${fillRemaining ? "min-w-0 flex-1" : sizeClass} align-baseline`}
      >
        <option value="">{ctx.selectPlaceholder}</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>,
      { fill: fillRemaining, showMeta: showHint },
    );
  }

  if (field.type === "radio") {
    if (field.options.length === 0) return null;
    if (!isFirstTokenForField) return null;
    return withSuggestion(
      field,
      <span
        role="radiogroup"
        className={`inline-flex flex-wrap items-center gap-x-4 gap-y-2 align-middle${invalid ? " rounded px-1 ring-2 ring-red-400" : ""}`}
      >
        {field.options.map((option) => (
          <label
            key={option.value}
            className="inline-flex items-center gap-1.5"
          >
            <input
              type="radio"
              name={field.name}
              checked={value === option.value}
              onChange={() => {
                ctx.clearFieldError(field.name);
                ctx.setValues((prev) => ({
                  ...prev,
                  [field.name]: option.value,
                }));
              }}
              className="form-choice-input"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </span>,
      { showMeta: showHint },
    );
  }

  if (field.type === "checkbox" && field.options.length > 0) {
    if (!isFirstTokenForField) return null;
    const selected = Array.isArray(value) ? value : [];
    return withSuggestion(
      field,
      <span
        className={`inline-flex flex-wrap items-center gap-x-4 gap-y-2 align-middle${invalid ? " rounded px-1 ring-2 ring-red-400" : ""}`}
      >
        {field.options.map((option) => (
          <label
            key={option.value}
            className="inline-flex items-center gap-1.5"
          >
            <input
              type="checkbox"
              aria-invalid={invalid}
              checked={selected.includes(option.value)}
              onChange={(e) => {
                ctx.clearFieldError(field.name);
                ctx.toggleCheckboxGroup(
                  field.name,
                  option.value,
                  e.target.checked,
                );
              }}
              className="form-choice-input"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </span>,
      { showMeta: showHint },
    );
  }

  if (field.type === "checkbox") {
    return withSuggestion(
      field,
      <label
        className={`inline-flex items-center gap-1.5 align-middle${invalid ? " rounded px-1 ring-2 ring-red-400" : ""}`}
      >
        <input
          type="checkbox"
          aria-required={field.required}
          aria-invalid={invalid}
          checked={value === true}
          onChange={(e) => {
            ctx.clearFieldError(field.name);
            ctx.setValues((prev) => ({
              ...prev,
              [field.name]: e.target.checked,
            }));
          }}
          className="form-choice-input"
        />
        <span>{field.placeholder || field.label}</span>
      </label>,
    );
  }

  if (field.type === "textarea") {
    const length = typeof value === "string" ? value.length : 0;
    return withSuggestion(
      field,
      <span className={`my-2 block ${sizeClass}`}>
        <textarea
          rows={5}
          aria-required={field.required}
          aria-invalid={invalid}
          maxLength={field.maxLength > 0 ? field.maxLength : undefined}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => {
            ctx.clearFieldError(field.name);
            ctx.setValues((prev) => ({
              ...prev,
              [field.name]: e.target.value,
            }));
          }}
          className={`${inputClass} block w-full`}
        />
        {field.maxLength > 0 ? (
          <span className="mt-1 block text-xs text-muted">
            {length}/{field.maxLength}
          </span>
        ) : null}
      </span>,
      { inline: false },
    );
  }

  const length = typeof value === "string" ? value.length : 0;
  return withSuggestion(
    field,
    <span
      className={
        fillRemaining
          ? "flex min-w-0 flex-1 flex-col align-baseline"
          : `inline-flex ${sizeClass} min-w-0 flex-col align-baseline`
      }
    >
      <input
        type={dateTimeInputType(field)}
        aria-required={field.required}
        aria-invalid={invalid}
        maxLength={
          field.type === "text" && field.maxLength > 0
            ? field.maxLength
            : undefined
        }
        value={typeof value === "string" ? value : ""}
        placeholder={dateTimePlaceholder(field) || field.placeholder}
        onChange={(e) => {
          ctx.clearFieldError(field.name);
          ctx.setValues((prev) => ({
            ...prev,
            [field.name]: e.target.value,
          }));
        }}
        className={`${inputClass} w-full min-w-0 align-baseline`}
      />
      {field.type === "text" && field.maxLength > 0 ? (
        <span className="mt-0.5 text-xs text-muted">
          {length}/{field.maxLength}
        </span>
      ) : null}
    </span>,
    { fill: fillRemaining },
  );
}

function FormMarkdownLayout({
  formId,
  preview = false,
  schemaMarkdown,
  fieldsByName,
  values,
  setValues,
  toggleCheckboxGroup,
  fieldErrors,
  clearFieldError,
  font = "default",
  title = "",
  selectPlaceholder,
}: {
  formId: string;
  preview?: boolean;
  schemaMarkdown: string;
  fieldsByName: Map<string, PublicFormField>;
  values: Record<string, FormSubmissionValue>;
  setValues: React.Dispatch<
    React.SetStateAction<Record<string, FormSubmissionValue>>
  >;
  toggleCheckboxGroup: (
    name: string,
    optionValue: string,
    checked: boolean,
  ) => void;
  fieldErrors: Record<string, string>;
  clearFieldError: (name: string) => void;
  font?: string;
  title?: string;
  selectPlaceholder: string;
}) {
  const { markdown, tokens } = useMemo(
    () => preprocessFormSchemaMarkdown(schemaMarkdown),
    [schemaMarkdown],
  );
  const tokensByIndex = useMemo(
    () => new Map(tokens.map((token) => [token.tokenIndex, token])),
    [tokens],
  );
  const firstTokenIndexByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const token of tokens) {
      if (!map.has(token.name)) {
        map.set(token.name, token.tokenIndex);
      }
    }
    return map;
  }, [tokens]);

  const ctx: FieldRenderContext = {
    formId,
    preview,
    fieldsByName,
    values,
    setValues,
    tokensByIndex,
    firstTokenIndexByName,
    fieldErrors,
    clearFieldError,
    toggleCheckboxGroup,
    selectPlaceholder,
  };

  return (
    <FormFieldRenderContext.Provider value={ctx}>
      <div
        className="prose-article-wide max-w-none text-foreground"
        style={formStepFontStyle(font)}
      >
        {title ? (
          <h3 className="!mt-0 font-display text-xl text-foreground">{title}</h3>
        ) : null}
        <ReactMarkdown
          remarkPlugins={[remarkDisableIndentedCode, remarkGfm, remarkBreaks]}
          urlTransform={allowFormFieldUrl}
          components={formMarkdownComponents}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </FormFieldRenderContext.Provider>
  );
}

export function PublicFormBlock({ form, preview = false }: Props) {
  const t = useTranslations("form");
  const fieldErrorMessages = useMemo<FormFieldErrorMessages>(
    () => ({
      required: (label) => t("required", { label }),
      invalidSelection: (label) => t("invalidSelection", { label }),
      invalidUpload: (label) => t("invalidUpload", { label }),
      invalidUploadKey: (label) => t("invalidUploadKey", { label }),
      maxLength: (label, max) => t("maxLength", { label, max }),
      invalidEmail: (label) => t("invalidEmail", { label }),
      invalidPhone: (label) => t("invalidPhone", { label }),
      invalidDate: (label) => t("invalidDate", { label }),
      invalidTime: (label) => t("invalidTime", { label }),
      invalidDateTime: (label) => t("invalidDateTime", { label }),
    }),
    [t],
  );
  const [values, setValues] = useState<Record<string, FormSubmissionValue>>(() =>
    Object.fromEntries(
      form.fields.map((field) => [field.name, defaultSubmissionValue(field)]),
    ),
  );
  const [state, setState] = useState<SubmitState>({ type: "idle" });
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Highlights only after an explicit Submit click — never after Next/tabs. */
  const [errorsVisible, setErrorsVisible] = useState(false);

  const fieldsByName = useMemo(
    () => new Map(form.fields.map((field) => [field.name, field])),
    [form.fields],
  );
  const layout = useMemo(
    () => splitFormMarkdownSteps(form.schemaMarkdown),
    [form.schemaMarkdown],
  );
  const steps = layout.steps;
  const markdownMode = form.schemaMarkdown.trim().length > 0;
  const multiStep = markdownMode && steps.length > 1;
  const currentStep = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];
  const isLastStep = !multiStep || stepIndex >= steps.length - 1;
  const actionsDisabled = state.type === "submitting";
  const visibleFieldErrors = errorsVisible ? fieldErrors : {};
  const visibleStepError = errorsVisible ? stepError : null;
  const visibleFormError =
    errorsVisible && state.type === "error" ? state.message : null;
  const selectPlaceholder = t("selectPlaceholder");

  function clearFieldError(name: string) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function findStepIndexForField(fieldName: string): number {
    if (layout.sharedFieldNames.includes(fieldName)) return stepIndex;
    const index = steps.findIndex((step) => step.fieldNames.includes(fieldName));
    return index >= 0 ? index : 0;
  }

  async function submitForm() {
    // Only the Submit button should call this — that is when we highlight.
    setErrorsVisible(true);
    const errors = collectSubmissionFieldErrors(
      form.fields,
      values,
      fieldErrorMessages,
    );
    if (Object.keys(errors).length > 0) {
      const firstField = Object.keys(errors)[0] ?? "";
      const firstError = errors[firstField] ?? t("fixFields");
      setFieldErrors(errors);
      setStepError(firstError);
      setState({ type: "error", message: firstError });
      if (multiStep && firstField) {
        setStepIndex(findStepIndexForField(firstField));
      }
      return;
    }

    setState({ type: "submitting" });
    setStepError(null);
    setFieldErrors({});
    setErrorsVisible(false);

    if (preview) {
      setState({
        type: "success",
        message: form.successMessage || t("previewSuccess"),
      });
      setStepIndex(0);
      setFieldErrors({});
      setValues(
        Object.fromEntries(
          form.fields.map((field) => [
            field.name,
            defaultSubmissionValue(field),
          ]),
        ),
      );
      return;
    }

    try {
      const res = await fetch(`/api/forms/${form.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values,
          pagePath:
            typeof window === "undefined"
              ? ""
              : `${window.location.pathname}${window.location.search}`,
          website: "",
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setErrorsVisible(true);
        setState({
          type: "error",
          message: json?.error || t("submitFailed"),
        });
        return;
      }
      setState({
        type: "success",
        message:
          form.successMessage || json.message || t("successFallback"),
      });
      setStepIndex(0);
      setFieldErrors({});
      setErrorsVisible(false);
      setValues(
        Object.fromEntries(
          form.fields.map((field) => [
            field.name,
            defaultSubmissionValue(field),
          ]),
        ),
      );
    } catch {
      setErrorsVisible(true);
      setState({
        type: "error",
        message: t("submitFailed"),
      });
    }
  }

  function goToStep(target: number) {
    setStepIndex((prev) => {
      if (target === prev) return prev;
      if (target < 0 || target >= steps.length) return prev;
      return target;
    });
    // Free travel — never validate when changing steps.
    setFieldErrors({});
    setStepError(null);
    setErrorsVisible(false);
    setState((prev) => (prev.type === "error" ? { type: "idle" } : prev));
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Enter advances mid-wizard only — never submits/validates here.
    if (multiStep && stepIndex < steps.length - 1) {
      goToStep(stepIndex + 1);
    }
  }

  function goBack() {
    setStepIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      return next;
    });
    setFieldErrors({});
    setStepError(null);
    setErrorsVisible(false);
    setState((prev) => (prev.type === "error" ? { type: "idle" } : prev));
  }

  function goNext() {
    setStepIndex((prev) => {
      const next = Math.min(prev + 1, Math.max(steps.length - 1, 0));
      return next;
    });
    setFieldErrors({});
    setStepError(null);
    setErrorsVisible(false);
    setState((prev) => (prev.type === "error" ? { type: "idle" } : prev));
  }

  function toggleCheckboxGroup(name: string, optionValue: string, checked: boolean) {
    setValues((prev) => {
      const current = Array.isArray(prev[name]) ? [...(prev[name] as string[])] : [];
      const next = checked
        ? [...new Set([...current, optionValue])]
        : current.filter((item) => item !== optionValue);
      return {
        ...prev,
        [name]: next,
      };
    });
  }

  return (
    <div
      className={
        markdownMode
          ? "space-y-5"
          : "rounded-2xl border border-border bg-background p-5 shadow-sm md:p-6"
      }
    >
      {preview ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("previewBanner")}
        </p>
      ) : null}
      <div className="mb-5 space-y-2">
        <h2 className="font-display text-2xl text-foreground">{form.name}</h2>
        {form.description ? (
          <p className="text-sm leading-6 text-muted">{form.description}</p>
        ) : null}
      </div>

      {state.type === "success" ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.message}
        </div>
      ) : (
        <form onSubmit={onFormSubmit} noValidate className="space-y-5">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden={true}
          />
          {markdownMode && currentStep ? (
            <>
              {layout.sharedMarkdown ? (
                <FormMarkdownLayout
                  formId={form.id}
                  preview={preview}
                  schemaMarkdown={layout.sharedMarkdown}
                  fieldsByName={fieldsByName}
                  values={values}
                  setValues={setValues}
                  toggleCheckboxGroup={toggleCheckboxGroup}
                  fieldErrors={visibleFieldErrors}
                  clearFieldError={clearFieldError}
                  selectPlaceholder={selectPlaceholder}
                />
              ) : null}
              {multiStep ? (
                <div className="space-y-3">
                  <div
                    role="tablist"
                    aria-label={t("stepsAriaLabel")}
                    className="flex flex-wrap gap-2 border-b border-border pb-2"
                  >
                    {steps.map((step, index) => {
                      const selected = index === stepIndex;
                      const hasError = step.fieldNames.some(
                        (name) => visibleFieldErrors[name],
                      );
                      return (
                        <button
                          key={`${step.title}-${index}`}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => goToStep(index)}
                          className={
                            selected
                              ? `rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white${hasError ? " ring-2 ring-red-400" : ""}`
                              : `rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-gray-100 hover:text-foreground${hasError ? " text-red-700 ring-1 ring-red-300" : ""}`
                          }
                        >
                          {step.title ||
                            t("stepFallback", { number: index + 1 })}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted">
                    {t("stepOf", {
                      current: stepIndex + 1,
                      total: steps.length,
                    })}
                  </p>
                </div>
              ) : null}
              <FormMarkdownLayout
                formId={form.id}
                preview={preview}
                schemaMarkdown={currentStep.markdown}
                fieldsByName={fieldsByName}
                values={values}
                setValues={setValues}
                toggleCheckboxGroup={toggleCheckboxGroup}
                fieldErrors={visibleFieldErrors}
                clearFieldError={clearFieldError}
                font={currentStep.font}
                title=""
                selectPlaceholder={selectPlaceholder}
              />
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {form.fields.map((field) => {
                const value = values[field.name];
                const invalid = Boolean(visibleFieldErrors[field.name]);
                const sizeClass = inputSizeClass(field.width);
                const typingClass = inputTypingClass(field);
                const commonTextClass = `${sizeClass} text-sm outline-none transition ${inputStyleClass(field.style, invalid)}${typingClass ? ` ${typingClass}` : ""}`;

                return (
                  <div key={field.id} className={fieldClass(field.width)}>
                    <div className="block text-sm">
                      <span className="mb-1.5 flex items-center font-medium text-foreground">
                        {field.label}
                        {field.required ? (
                          <span className="ml-1 text-red-600">*</span>
                        ) : null}
                        <FieldSuggestionIcon text={field.helpText} />
                      </span>
                      {visibleFieldErrors[field.name] ? (
                        <p className="mb-1.5 text-xs text-red-600">
                          {visibleFieldErrors[field.name]}
                        </p>
                      ) : null}

                      {field.type === "textarea" ? (
                        <div>
                          <textarea
                            rows={5}
                            aria-required={field.required}
                            aria-invalid={invalid}
                            maxLength={
                              field.maxLength > 0 ? field.maxLength : undefined
                            }
                            value={typeof value === "string" ? value : ""}
                            placeholder={field.placeholder}
                            onChange={(e) => {
                              clearFieldError(field.name);
                              setValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }));
                            }}
                            className={commonTextClass}
                          />
                          {field.maxLength > 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              {(typeof value === "string" ? value.length : 0)}/
                              {field.maxLength}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {field.type === "select" ? (
                        <select
                          aria-required={field.required}
                          aria-invalid={invalid}
                          value={typeof value === "string" ? value : ""}
                          onChange={(e) => {
                            clearFieldError(field.name);
                            setValues((prev) => ({
                              ...prev,
                              [field.name]: e.target.value,
                            }));
                          }}
                          className={commonTextClass}
                        >
                          <option value="">{selectPlaceholder}</option>
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {field.type === "radio" ? (
                        <div
                          role="radiogroup"
                          aria-required={field.required || undefined}
                          aria-invalid={invalid || undefined}
                          className={`space-y-2 rounded-lg border border-gray-200 p-3${invalid ? " border-red-500 ring-2 ring-red-400" : ""}`}
                        >
                          {field.options.map((option) => (
                            <label
                              key={option.value}
                              className="flex items-center gap-2 text-sm"
                            >
                              <input
                                type="radio"
                                name={field.name}
                                checked={value === option.value}
                                onChange={() => {
                                  clearFieldError(field.name);
                                  setValues((prev) => ({
                                    ...prev,
                                    [field.name]: option.value,
                                  }));
                                }}
                                className="form-choice-input"
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}

                      {field.type === "checkbox" ? (
                        field.options.length > 0 ? (
                          <div
                            className={`space-y-2 rounded-lg border border-gray-200 p-3${invalid ? " border-red-500 ring-2 ring-red-400" : ""}`}
                          >
                            {field.options.map((option) => {
                              const selected = Array.isArray(value)
                                ? value.includes(option.value)
                                : false;
                              return (
                                <label
                                  key={option.value}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    aria-invalid={invalid}
                                    checked={selected}
                                    onChange={(e) => {
                                      clearFieldError(field.name);
                                      setValues((prev) => {
                                        const current = Array.isArray(
                                          prev[field.name],
                                        )
                                          ? [...(prev[field.name] as string[])]
                                          : [];
                                        const next = e.target.checked
                                          ? [
                                              ...new Set([
                                                ...current,
                                                option.value,
                                              ]),
                                            ]
                                          : current.filter(
                                              (item) => item !== option.value,
                                            );
                                        return {
                                          ...prev,
                                          [field.name]: next,
                                        };
                                      });
                                    }}
                                    className="form-choice-input"
                                  />
                                  <span>{option.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <label
                            className={`flex items-start gap-2 rounded-lg border border-gray-200 p-3${invalid ? " border-red-500 ring-2 ring-red-400" : ""}`}
                          >
                            <input
                              type="checkbox"
                              aria-required={field.required}
                              aria-invalid={invalid}
                              checked={value === true}
                              onChange={(e) => {
                                clearFieldError(field.name);
                                setValues((prev) => ({
                                  ...prev,
                                  [field.name]: e.target.checked,
                                }));
                              }}
                              className="form-choice-input"
                            />
                            <span className="text-sm leading-6 text-foreground">
                              {field.placeholder || field.label}
                            </span>
                          </label>
                        )
                      ) : null}

                      {field.type === "image" || field.type === "file" ? (
                        <FormUploadControl
                          formId={form.id}
                          field={field}
                          value={value}
                          showSuggestion={false}
                          invalid={invalid}
                          preview={preview}
                          onChange={(next) => {
                            clearFieldError(field.name);
                            setValues((prev) => ({
                              ...prev,
                              [field.name]: next,
                            }));
                          }}
                        />
                      ) : null}

                      {field.type !== "textarea" &&
                      field.type !== "select" &&
                      field.type !== "radio" &&
                      field.type !== "checkbox" &&
                      field.type !== "image" &&
                      field.type !== "file" ? (
                        <div>
                          <input
                            type={dateTimeInputType(field)}
                            aria-required={field.required}
                            aria-invalid={invalid}
                            maxLength={
                              field.type === "text" && field.maxLength > 0
                                ? field.maxLength
                                : undefined
                            }
                            value={typeof value === "string" ? value : ""}
                            placeholder={
                              dateTimePlaceholder(field) || field.placeholder
                            }
                            onChange={(e) => {
                              clearFieldError(field.name);
                              setValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }));
                            }}
                            className={commonTextClass}
                          />
                          {field.type === "text" && field.maxLength > 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              {(typeof value === "string" ? value.length : 0)}/
                              {field.maxLength}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {visibleStepError || visibleFormError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {visibleStepError || visibleFormError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {multiStep ? (
              <>
                <button
                  key="form-prev"
                  type="button"
                  onClick={goBack}
                  disabled={stepIndex === 0 || actionsDisabled}
                  suppressHydrationWarning
                  className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("previous")}
                </button>
                {isLastStep ? (
                  <button
                    key="form-submit"
                    type="button"
                    onClick={() => void submitForm()}
                    disabled={actionsDisabled}
                    className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
                  >
                    {state.type === "submitting"
                      ? t("sending")
                      : form.submitLabel}
                  </button>
                ) : (
                  <button
                    key="form-next"
                    type="button"
                    onClick={goNext}
                    disabled={actionsDisabled}
                    className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
                  >
                    {t("next")}
                  </button>
                )}
              </>
            ) : (
              <button
                key="form-submit"
                type="button"
                onClick={() => void submitForm()}
                disabled={actionsDisabled}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
              >
                {state.type === "submitting"
                  ? t("sending")
                  : form.submitLabel}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
