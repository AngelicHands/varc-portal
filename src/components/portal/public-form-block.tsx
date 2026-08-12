"use client";

import { useMemo, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { PublicFormDefinition, PublicFormField } from "@/lib/forms";
import {
  FORM_FIELD_LINK_PREFIX,
  formStepFontStyle,
  preprocessFormSchemaMarkdown,
  splitFormMarkdownSteps,
  type FormMarkdownToken,
} from "@/lib/form-markdown";
import {
  FORM_UPLOAD_FILE_MIME,
  FORM_UPLOAD_IMAGE_MIME,
  FORM_UPLOAD_MAX_BYTES,
  collectSubmissionFieldErrors,
  isFormUploadValue,
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

function fieldClass(width: "full" | "half") {
  return width === "half" ? "md:col-span-1" : "md:col-span-2";
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = isFormUploadValue(value) ? value : null;
  const accept =
    field.type === "image"
      ? FORM_UPLOAD_IMAGE_MIME.join(",")
      : FORM_UPLOAD_FILE_MIME.join(",");

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setError(null);

    if (file.size <= 0 || file.size > FORM_UPLOAD_MAX_BYTES) {
      setError(
        `File must be under ${Math.floor(FORM_UPLOAD_MAX_BYTES / (1024 * 1024))}MB`,
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
        setError(json?.error || "Upload failed");
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
      setError("Upload failed");
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
        <span className="text-xs text-muted">Uploading…</span>
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
            Remove
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
};

function withSuggestion(
  field: PublicFormField,
  control: React.ReactNode,
  options?: { inline?: boolean; showMeta?: boolean; fill?: boolean },
) {
  const inline = options?.inline ?? true;
  const showMeta = options?.showMeta ?? true;
  const fill = options?.fill ?? false;
  return (
    <span
      className={
        fill
          ? "flex w-full min-w-0 items-center gap-1"
          : inline
            ? "inline-flex items-center gap-1 align-middle"
            : "block"
      }
    >
      {control}
      {showMeta && field.type !== "image" && field.type !== "file" ? (
        <FieldSuggestionIcon text={field.helpText} />
      ) : null}
      {showMeta &&
      field.required &&
      field.type !== "image" &&
      field.type !== "file" ? (
        <span className="shrink-0 text-xs text-red-600">*</span>
      ) : null}
    </span>
  );
}

function isFillWidthFieldType(type: PublicFormField["type"]) {
  return (
    type === "text" ||
    type === "email" ||
    type === "phone" ||
    type === "date" ||
    type === "date_time" ||
    type === "select"
  );
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
  const inputClass = `text-sm outline-none transition ${inputStyleClass(field.style, invalid)}`;
  const isFirstTokenForField =
    ctx.firstTokenIndexByName.get(field.name) === tokenIndex;
  const showHint = isFirstTokenForField;

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
        className={`${inputClass} my-1 w-full align-baseline`}
      >
        <option value="">Select…</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>,
      { fill: true, showMeta: showHint },
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
      <span className="my-2 block w-full">
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
    <span className="flex w-full min-w-0 flex-col align-baseline">
      <input
        type={
          field.type === "email"
            ? "email"
            : field.type === "phone"
              ? "tel"
              : field.type === "date"
                ? "date"
                : field.type === "date_time"
                  ? "datetime-local"
                  : "text"
        }
        aria-required={field.required}
        aria-invalid={invalid}
        maxLength={
          field.type === "text" && field.maxLength > 0
            ? field.maxLength
            : undefined
        }
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
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
    { fill: true },
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
  };

  return (
    <div
      className="prose-article-wide max-w-none text-foreground"
      style={formStepFontStyle(font)}
    >
      {title ? (
        <h3 className="!mt-0 font-display text-xl text-foreground">{title}</h3>
      ) : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={allowFormFieldUrl}
        components={{
          // Avoid <p> wrapping fields — invalid nesting with controls breaks hydration.
          p: ({ children }) => <div className="my-[1em]">{children}</div>,
          img: ({ src }) => {
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
            const fill = field ? isFillWidthFieldType(field.type) : false;
            return (
              <span
                className={
                  fill ? "not-prose form-field-slot" : "not-prose form-field-inline"
                }
              >
                {renderFormFieldToken(tokenIndex, ctx)}
              </span>
            );
          },
          input: ({ type, checked, ...props }) => {
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
            return <input type={type} {...props} />;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function PublicFormBlock({ form, preview = false }: Props) {
  const [values, setValues] = useState<Record<string, FormSubmissionValue>>(() =>
    Object.fromEntries(
      form.fields.map((field) => [
        field.name,
        field.type === "checkbox"
          ? field.options.length > 0
            ? []
            : false
          : "",
      ]),
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
    const errors = collectSubmissionFieldErrors(form.fields, values);
    if (Object.keys(errors).length > 0) {
      const firstField = Object.keys(errors)[0] ?? "";
      const firstError = errors[firstField] ?? "Please fix the highlighted fields";
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
        message:
          form.successMessage ||
          "Preview only — submission was not sent.",
      });
      setStepIndex(0);
      setFieldErrors({});
      setValues(
        Object.fromEntries(
          form.fields.map((field) => [
            field.name,
            field.type === "checkbox"
              ? field.options.length > 0
                ? []
                : false
              : "",
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
          message: json?.error || "Failed to submit the form",
        });
        return;
      }
      setState({
        type: "success",
        message:
          form.successMessage ||
          json.message ||
          "Thank you. Your submission has been received.",
      });
      setStepIndex(0);
      setFieldErrors({});
      setErrorsVisible(false);
      setValues(
        Object.fromEntries(
          form.fields.map((field) => [
            field.name,
            field.type === "checkbox"
              ? field.options.length > 0
                ? []
                : false
              : "",
          ]),
        ),
      );
    } catch {
      setErrorsVisible(true);
      setState({
        type: "error",
        message: "Failed to submit the form",
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
          Preview only — submissions and uploads are not saved.
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
                />
              ) : null}
              {multiStep ? (
                <div className="space-y-3">
                  <div
                    role="tablist"
                    aria-label="Form steps"
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
                          {step.title || `Step ${index + 1}`}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted">
                    Step {stepIndex + 1} of {steps.length}
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
              />
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {form.fields.map((field) => {
                const value = values[field.name];
                const invalid = Boolean(visibleFieldErrors[field.name]);
                const commonTextClass = `w-full text-sm outline-none transition ${inputStyleClass(field.style, invalid)}`;

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
                          <option value="">Select…</option>
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
                            type={
                              field.type === "email"
                                ? "email"
                                : field.type === "phone"
                                  ? "tel"
                                  : field.type === "date"
                                    ? "date"
                                    : field.type === "date_time"
                                      ? "datetime-local"
                                      : "text"
                            }
                            aria-required={field.required}
                            aria-invalid={invalid}
                            maxLength={
                              field.type === "text" && field.maxLength > 0
                                ? field.maxLength
                                : undefined
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
                  Previous
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
                      ? "Sending..."
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
                    Next
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
                  ? "Sending..."
                  : form.submitLabel}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
