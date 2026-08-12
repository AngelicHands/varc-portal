"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import {
  deleteFormDefinitionAction,
  saveFormDefinitionAction,
} from "@/lib/actions";
import {
  emptyFormField,
  normalizeFormFieldWidth,
  parseFormSchemaMarkdown,
  type FormDefinitionFormValues,
  type FormDefinitionMode,
  type FormFieldDefinition,
  type FormFieldType,
  type FormFieldWidth,
  type FormLocaleValues,
} from "@/lib/validations/forms";
import { makeSlug } from "@/lib/slug";
import { notifyAction, notifyError } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";
import { PublicFormBlock } from "@/components/portal/public-form-block";
import type { PublicFormDefinition } from "@/lib/forms";
import enMessages from "../../../messages/en.json";
import viMessages from "../../../messages/vi.json";

type LocaleTab = "vi" | "en";
type MarkdownView = "edit" | "preview";

function FormPreviewI18n({
  locale,
  children,
}: {
  locale: LocaleTab;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : viMessages}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Radio" },
  { value: "date", label: "Date" },
  { value: "date_time", label: "Date & time" },
  { value: "image", label: "Image upload" },
  { value: "file", label: "File upload" },
];

function buildMarkdownPreviewForm(params: {
  formId?: string;
  locale: FormLocaleValues;
  fallback: FormLocaleValues;
}): { form: PublicFormDefinition } | { error: string } {
  const preferredMarkdown = (params.locale.schemaMarkdown ?? "").trim();
  const fallbackMarkdown = (params.fallback.schemaMarkdown ?? "").trim();
  const schemaMarkdown = preferredMarkdown || fallbackMarkdown;

  if (!schemaMarkdown) {
    return { error: "Add markdown layout to preview this form." };
  }

  const parsed = parseFormSchemaMarkdown(schemaMarkdown);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  return {
    form: {
      id: params.formId || "preview",
      key: "preview",
      name:
        (params.locale.name ?? "").trim() ||
        (params.fallback.name ?? "").trim() ||
        "Form preview",
      description:
        (params.locale.description ?? "").trim() ||
        (params.fallback.description ?? "").trim(),
      submitLabel:
        (params.locale.submitLabel ?? "").trim() ||
        (params.fallback.submitLabel ?? "").trim() ||
        "Send",
      successMessage:
        (params.locale.successMessage ?? "").trim() ||
        (params.fallback.successMessage ?? "").trim() ||
        "Thank you. Your submission has been received.",
      schemaMarkdown,
      fields: parsed.fields,
    },
  };
}

function MarkdownHelpModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-semibold text-gray-900">
            Markdown form syntax
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-5 text-sm leading-6 text-gray-700">
          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Overview</h3>
            <p>
              Write normal markdown for the layout. Every control uses the same
              placeholder shape:{" "}
              <code>{`#![type:{name}:{properties}]`}</code>. If the markdown box
              is filled, it becomes the source of truth for fields.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800">
{`#![text|email|phone|textarea|select|checkbox|radio|date|date_time|image|file:{field_name}:{
  required:true,
  placeholder:"…",
  maxLength:80,
  size:medium,
  style:underline,
  suggestion:"…"
}]`}
            </pre>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Examples</h3>
            <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800">
{`Your name: #![text:{full_name}:{required:true,placeholder:"Your name",style:underline,size:wide,maxLength:80,suggestion:"Enter your legal name"}]
Notes: #![textarea:{notes}:{required:true,maxLength:500,size:full-width}]
Email: #![email:{email}:{required:true,placeholder:"name@example.com",size:medium}]
Meeting: #![date_time:{meeting_at}:{required:true}]
Prefer contact by:
#![radio:{contact}:{options:[{value:"email",label:"Email"},{value:"phone",label:"Phone"}],suggestion:"Choose one"}]
Topics:
#![checkbox:{topics}:{options:[{value:"dx",label:"DX"},{value:"comms",label:"Emergency comms"}],suggestion:"Select all that apply"}]
ID photo: #![image:{id_photo}:{required:true,suggestion:"JPEG or PNG"}]
Resume: #![file:{resume}:{suggestion:"PDF preferred"}]
Choose region: #![select:{region}:{options:[{value:"north",label:"North"},{value:"south",label:"South"}],size:medium}]`}
            </pre>
            <p>
              Use <code>size:full-width</code> when a text / email / phone /
              date / select input should fill the remaining width on the same
              line as the label.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Properties</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code>required:true</code> — required field
              </li>
              <li>
                <code>placeholder:&quot;…&quot;</code> — input placeholder
              </li>
              <li>
                <code>suggestion:&quot;…&quot;</code> or{" "}
                <code>help:&quot;…&quot;</code> — shown under an (i) icon on the
                public form
              </li>
              <li>
                <code>max:200</code> or <code>maxLength:200</code> — max
                characters for <code>text</code> / <code>textarea</code>
              </li>
              <li>
                <code>size:default|medium|wide|full-width</code> — input width
                preset (<code>width:</code> is accepted as an alias)
              </li>
              <li>
                <code>style:default|borderless|underline|dotted_underline</code>
              </li>
              <li>
                Option lists for radio, checkbox, and select:
                <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800">
{`#![checkbox:{topics}:{options:[
  {value:"dx",label:"DX"},
  {value:"comms",label:"Emergency comms"}
],suggestion:"Select all that apply"}]

#![radio:{contact}:{options:[{value:"email",label:"Email"},{value:"phone",label:"Phone"}]}]

#![select:{region}:{options:[{value:"north",label:"North"},{value:"south",label:"South"}]}]`}
                </pre>
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Multi-stage tabs</h3>
            <p>
              Content before the first step marker is shared heading text on
              every tab. Tabs are defined by:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800">
{`## Application title

Shared intro text for all stages.

!#![step:"Personal info":{font:serif}]

Name: #![text:{full_name}:{required:true}]

!#![step:"Documents":{font:sans}]

Photo: #![image:{id_photo}:{required:true}]`}
            </pre>
            <p>
              Font presets: <code>default</code>, <code>sans</code>,{" "}
              <code>serif</code>, <code>display</code>, <code>mono</code>, or a
              custom CSS family like{" "}
              <code>{`{font:"Georgia, serif"}`}</code>.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Languages</h3>
            <p>
              Vietnamese is required. English is optional — leave it empty to
              fall back to Vietnamese. English markdown must use the same field
              keys, types, and option values as Vietnamese.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

type Props = {
  formId?: string;
  initial: FormDefinitionFormValues & {
    key?: string;
  };
};

type FormEditorState = {
  status: FormDefinitionFormValues["status"];
  definitionMode: FormDefinitionMode;
  locales: {
    vi: FormLocaleValues;
    en: FormLocaleValues;
  };
};

function mapLocaleFields(
  fields:
    | Array<{
        id: string;
        type: FormFieldDefinition["type"];
        name: string;
        label: string;
        required: boolean;
        placeholder?: string;
        helpText?: string;
        maxLength?: number;
        width?: string | null;
        style?: FormFieldDefinition["style"];
        options?: FormFieldDefinition["options"];
      }>
    | undefined,
): FormFieldDefinition[] {
  return (fields ?? []).map((field) => ({
    id: field.id,
    type: field.type,
    name: field.name,
    label: field.label,
    required: field.required,
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    maxLength: field.maxLength ?? 0,
    width: normalizeFormFieldWidth(field.width),
    style: field.style ?? "default",
    options: (field.options ?? []).map((option) => ({
      label: option.label,
      value: option.value,
    })),
  }));
}

function normalizeInitial(
  initial: Props["initial"],
  mode: FormDefinitionMode,
): FormEditorState {
  return {
    status: initial.status,
    definitionMode: mode,
    locales: {
      vi: {
        name: initial.locales?.vi?.name ?? "",
        description: initial.locales?.vi?.description ?? "",
        submitLabel: initial.locales?.vi?.submitLabel ?? "Gửi",
        successMessage:
          initial.locales?.vi?.successMessage ??
          "Cảm ơn bạn. Chúng tôi đã nhận được thông tin.",
        schemaMarkdown: initial.locales?.vi?.schemaMarkdown ?? "",
        fields: mapLocaleFields(initial.locales?.vi?.fields),
      },
      en: {
        name: initial.locales?.en?.name ?? "",
        description: initial.locales?.en?.description ?? "",
        submitLabel: initial.locales?.en?.submitLabel ?? "Send",
        successMessage:
          initial.locales?.en?.successMessage ??
          "Thank you. Your submission has been received.",
        schemaMarkdown: initial.locales?.en?.schemaMarkdown ?? "",
        fields: mapLocaleFields(initial.locales?.en?.fields),
      },
    },
  };
}

function resolveInitialMode(
  formId: string | undefined,
  initial: Props["initial"],
): FormDefinitionMode | null {
  // New forms always ask for a type first.
  if (!formId) return null;
  if (initial.definitionMode === "fields" || initial.definitionMode === "markdown") {
    return initial.definitionMode;
  }
  return (initial.locales?.vi?.schemaMarkdown ?? "").trim()
    ? "markdown"
    : "fields";
}

function defaultNameFromLabel(label: string) {
  return makeSlug(label).replace(/-/g, "_");
}

function optionsToText(options: FormFieldDefinition["options"]) {
  return options.map((option) => `${option.label}|${option.value}`).join("\n");
}

function textToOptions(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, rawValue] = line.split("|");
      const trimmedLabel = (label ?? "").trim();
      const value = (rawValue ?? defaultNameFromLabel(trimmedLabel)).trim();
      return {
        label: trimmedLabel,
        value: value || defaultNameFromLabel(trimmedLabel),
      };
    });
}

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M15 3h6v6M9 21H3v-6M21 9V3h-6M3 15v6h6" />
      <path d="M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
    </svg>
  );
}

export function FormDefinitionEditor({ formId, initial }: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [markdownFullscreen, setMarkdownFullscreen] = useState(false);
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const [tab, setTab] = useState<LocaleTab>("vi");
  const [markdownView, setMarkdownView] = useState<MarkdownView>("edit");
  const [definitionMode, setDefinitionMode] = useState<FormDefinitionMode | null>(
    () => resolveInitialMode(formId, initial),
  );
  const [form, setForm] = useState<FormEditorState>(() =>
    normalizeInitial(
      initial,
      resolveInitialMode(formId, initial) ?? "fields",
    ),
  );

  const locale = form.locales[tab];
  const isMarkdownMode = definitionMode === "markdown";
  const isFieldsMode = definitionMode === "fields";
  const showFieldSchema = isFieldsMode && tab === "vi";
  const markdownPreview = useMemo(() => {
    if (!isMarkdownMode) return null;
    return buildMarkdownPreviewForm({
      formId,
      locale,
      fallback: form.locales.vi,
    });
  }, [form.locales.vi, formId, isMarkdownMode, locale]);

  function chooseDefinitionMode(mode: FormDefinitionMode) {
    setDefinitionMode(mode);
    setMarkdownError(null);
    setForm((prev) => ({
      ...prev,
      definitionMode: mode,
      locales:
        mode === "fields"
          ? {
              vi: { ...prev.locales.vi, schemaMarkdown: "" },
              en: { ...prev.locales.en, schemaMarkdown: "", fields: [] },
            }
          : {
              vi: { ...prev.locales.vi, fields: [] },
              en: { ...prev.locales.en, fields: [] },
            },
    }));
  }

  useEffect(() => {
    if (!markdownFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMarkdownFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [markdownFullscreen]);

  const keyPreview = useMemo(() => {
    const viName = (form.locales.vi.name ?? "").trim();
    return initial.key || (viName ? makeSlug(viName) : "(assigned on save)");
  }, [form.locales.vi.name, initial.key]);

  function updateLocale(
    updater: (current: FormEditorState["locales"][LocaleTab]) => FormEditorState["locales"][LocaleTab],
  ) {
    setForm((prev) => ({
      ...prev,
      locales: {
        ...prev.locales,
        [tab]: updater(prev.locales[tab]),
      },
    }));
  }

  function setField(
    fieldId: string,
    updater: (field: FormFieldDefinition) => FormFieldDefinition,
  ) {
    updateLocale((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? updater(field) : field,
      ),
    }));
  }

  function addField(type: FormFieldType) {
    updateLocale((current) => ({
      ...current,
      fields: [...current.fields, emptyFormField(type)],
    }));
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    updateLocale((current) => {
      const fields = [...current.fields];
      const index = fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= fields.length) return current;
      const [item] = fields.splice(index, 1);
      if (!item) return current;
      fields.splice(nextIndex, 0, item);
      return { ...current, fields };
    });
  }

  function removeField(fieldId: string) {
    updateLocale((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  }

  function onSave(status: "draft" | "published") {
    setError(null);
    if (!definitionMode) {
      const message = "Choose a form type before saving";
      setError(message);
      notifyError(message);
      return;
    }

    const nextLocales = { ...form.locales };

    if (definitionMode === "markdown") {
      for (const key of ["vi", "en"] as const) {
        const markdown = (nextLocales[key].schemaMarkdown ?? "").trim();
        if (!markdown) {
          nextLocales[key] = {
            ...nextLocales[key],
            schemaMarkdown: "",
            fields: key === "en" ? [] : nextLocales[key].fields,
          };
          continue;
        }
        const parsed = parseFormSchemaMarkdown(markdown);
        if (!parsed.ok) {
          const message = `Unable to save form (${key.toUpperCase()}):\n${parsed.error}`;
          setTab(key);
          setMarkdownError(parsed.error);
          setError(message);
          notifyError(parsed.error);
          return;
        }
        nextLocales[key] = {
          ...nextLocales[key],
          schemaMarkdown: markdown,
          fields: parsed.fields,
        };
      }
    } else {
      nextLocales.vi = {
        ...nextLocales.vi,
        schemaMarkdown: "",
      };
      nextLocales.en = {
        ...nextLocales.en,
        schemaMarkdown: "",
        fields: [],
      };
    }

    setMarkdownError(null);
    const nextForm = {
      status,
      definitionMode,
      locales: nextLocales,
    };
    setForm(nextForm);

    startTransition(async () => {
      const result = await saveFormDefinitionAction(formId ?? null, nextForm);
      if (
        !notifyAction(
          result,
          status === "published" ? "Form published" : "Form saved",
        )
      ) {
        setError(result.error);
        return;
      }
      router.push(`/admin/forms/${result.id}`);
      router.refresh();
    });
  }

  async function onDelete() {
    if (!formId) return;
    const confirmed = await ask({
      title: "Move to trash",
      message: "Move this form to trash?",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteFormDefinitionAction(formId);
      if (!notifyAction(result, "Moved to trash")) {
        setError(result.error);
        return;
      }
      router.push("/admin/forms");
      router.refresh();
    });
  }

  if (!definitionMode) {
    return (
      <>
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Choose a form type
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              This choice is fixed after you start editing. Pick how you want to
              define the form fields.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => chooseDefinitionMode("fields")}
              className="rounded-lg border border-gray-200 bg-white p-5 text-left hover:border-gray-400 hover:bg-gray-50"
            >
              <p className="text-base font-semibold text-gray-900">
                Schema fields
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Build the form with typed fields in the admin UI — labels,
                options, validation, and input size.
              </p>
            </button>
            <button
              type="button"
              onClick={() => chooseDefinitionMode("markdown")}
              className="rounded-lg border border-gray-200 bg-white p-5 text-left hover:border-gray-400 hover:bg-gray-50"
            >
              <p className="text-base font-semibold text-gray-900">Markdown</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Write a markdown layout with <code>#![…]</code> field tokens for
                richer multi-step and freeform designs.
              </p>
            </button>
          </div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-medium">Could not save</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-5">
              {error}
            </pre>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">
              Reusable forms can be embedded in page and template layouts.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Form type:{" "}
              <span className="font-medium text-gray-700">
                {isMarkdownMode ? "Markdown" : "Schema fields"}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onSave("draft")}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSave("published")}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              Publish
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTab("vi");
              setMarkdownError(null);
            }}
            className={`rounded px-3 py-1.5 text-sm ${tab === "vi" ? "bg-gray-900 text-white" : "border border-gray-300"}`}
          >
            Vietnamese
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("en");
              setMarkdownError(null);
            }}
            className={`rounded px-3 py-1.5 text-sm ${tab === "en" ? "bg-gray-900 text-white" : "border border-gray-300"}`}
          >
            English
          </button>
        </div>

        <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">
              Name ({tab.toUpperCase()})
            </span>
            <input
              value={locale.name}
              onChange={(e) =>
                updateLocale((current) => ({
                  ...current,
                  name: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="block text-sm">
            <span className="mb-1 block font-medium">Key</span>
            <p className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 font-mono text-gray-600">
              {keyPreview}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Shared across languages. Generated from the Vietnamese name.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Submit button</span>
            <input
              value={locale.submitLabel}
              onChange={(e) =>
                updateLocale((current) => ({
                  ...current,
                  submitLabel: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Description</span>
            <textarea
              rows={2}
              value={locale.description}
              onChange={(e) =>
                updateLocale((current) => ({
                  ...current,
                  description: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Success message</span>
            <textarea
              rows={2}
              value={locale.successMessage}
              onChange={(e) =>
                updateLocale((current) => ({
                  ...current,
                  successMessage: e.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        {isMarkdownMode ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="text-lg font-semibold">Markdown layout</h2>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    aria-label="Markdown syntax help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-400 text-[11px] font-semibold leading-none text-gray-600 hover:border-gray-700 hover:text-gray-900"
                  >
                    i
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded border border-gray-300 p-0.5">
                    <button
                      type="button"
                      onClick={() => setMarkdownView("edit")}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        markdownView === "edit"
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarkdownView("preview")}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        markdownView === "preview"
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Preview
                    </button>
                  </div>
                  {markdownView === "edit" ? (
                    <button
                      type="button"
                      onClick={() => setMarkdownFullscreen(true)}
                      aria-label="Expand markdown editor"
                      title="Expand"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-600 hover:border-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <ExpandIcon />
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {markdownView === "edit"
                  ? `Markdown layout for ${tab.toUpperCase()}. Field tokens become the source of truth for this language.${
                      tab === "en"
                        ? " Leave empty to fall back to Vietnamese fields."
                        : ""
                    }`
                  : "Live preview of the public form for the current language."}
              </p>
            </div>
            {markdownView === "edit" ? (
              <>
                <textarea
                  rows={8}
                  value={locale.schemaMarkdown ?? ""}
                  onChange={(e) => {
                    setMarkdownError(null);
                    updateLocale((current) => ({
                      ...current,
                      schemaMarkdown: e.target.value,
                    }));
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                />
                {markdownError ? (
                  <p className="mt-2 text-sm text-red-700">{markdownError}</p>
                ) : null}
              </>
            ) : markdownPreview && "error" in markdownPreview ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {markdownPreview.error}
              </p>
            ) : markdownPreview && "form" in markdownPreview ? (
              <div className="rounded-lg border border-gray-200 bg-[var(--background,#fff)] p-4 sm:p-6">
                <FormPreviewI18n locale={tab}>
                  <PublicFormBlock form={markdownPreview.form} preview />
                </FormPreviewI18n>
              </div>
            ) : null}
          </div>
        ) : null}

        {showFieldSchema ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Field schema</h2>
                <p className="text-sm text-gray-500">
                  Define fields for this form. Structure is shared across
                  languages; English can reuse Vietnamese field labels.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {FIELD_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => addField(type.value)}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Add {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {locale.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">
                      Field {index + 1} ·{" "}
                      {
                        FIELD_TYPES.find((item) => item.value === field.type)
                          ?.label
                      }
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveField(field.id, -1)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-white"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(field.id, 1)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-white"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(field.id)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">Type</span>
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const nextType = e.target.value as FormFieldType;
                          setField(field.id, (current) => ({
                            ...current,
                            type: nextType,
                            options:
                              nextType === "select" ||
                              nextType === "radio" ||
                              nextType === "checkbox"
                                ? current.options.length
                                  ? current.options
                                  : [{ label: "Option 1", value: "option-1" }]
                                : [],
                          }));
                        }}
                        className="w-full rounded border border-gray-300 px-3 py-2"
                      >
                        {FIELD_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Input size
                      </span>
                      <select
                        value={field.width}
                        onChange={(e) =>
                          setField(field.id, (current) => ({
                            ...current,
                            width: e.target.value as FormFieldWidth,
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-3 py-2"
                      >
                        <option value="default">Default</option>
                        <option value="medium">Medium</option>
                        <option value="wide">Wide</option>
                        <option value="full-width">Full width</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Input style
                      </span>
                      <select
                        value={field.style}
                        onChange={(e) =>
                          setField(field.id, (current) => ({
                            ...current,
                            style: e.target.value as
                              | "default"
                              | "borderless"
                              | "underline"
                              | "dotted_underline",
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-3 py-2"
                      >
                        <option value="default">Default</option>
                        <option value="borderless">Borderless</option>
                        <option value="underline">Underline</option>
                        <option value="dotted_underline">Dotted underline</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">Label</span>
                      <input
                        value={field.label}
                        onChange={(e) =>
                          setField(field.id, (current) => {
                            const label = e.target.value;
                            return {
                              ...current,
                              label,
                              name:
                                current.name.trim() || !label.trim()
                                  ? current.name
                                  : defaultNameFromLabel(label),
                            };
                          })
                        }
                        className="w-full rounded border border-gray-300 px-3 py-2"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Field key
                      </span>
                      <input
                        value={field.name}
                        onChange={(e) =>
                          setField(field.id, (current) => ({
                            ...current,
                            name: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Placeholder
                      </span>
                      <input
                        value={field.placeholder}
                        onChange={(e) =>
                          setField(field.id, (current) => ({
                            ...current,
                            placeholder: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-3 py-2"
                      />
                    </label>

                    {field.type === "text" || field.type === "textarea" ? (
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">
                          Max characters
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          value={field.maxLength || ""}
                          onChange={(e) =>
                            setField(field.id, (current) => ({
                              ...current,
                              maxLength: Math.max(
                                0,
                                Number.parseInt(e.target.value || "0", 10) || 0,
                              ),
                            }))
                          }
                          className="w-full rounded border border-gray-300 px-3 py-2"
                          placeholder="0 = no limit"
                        />
                      </label>
                    ) : null}

                    <label className="flex items-center gap-2 pt-7 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          setField(field.id, (current) => ({
                            ...current,
                            required: e.target.checked,
                          }))
                        }
                      />
                      Required
                    </label>

                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-sm font-medium">
                        Suggestion (shown under an (i) icon)
                      </span>
                      <textarea
                        rows={2}
                        value={field.helpText}
                        onChange={(e) =>
                          setField(field.id, (current) => ({
                            ...current,
                            helpText: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-3 py-2"
                        placeholder="Hint shown when visitors hover the (i) icon"
                      />
                    </label>

                    {field.type === "select" ||
                    field.type === "radio" ||
                    field.type === "checkbox" ? (
                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium">
                          Options
                        </span>
                        <textarea
                          rows={4}
                          value={optionsToText(field.options ?? [])}
                          onChange={(e) =>
                            setField(field.id, (current) => ({
                              ...current,
                              options: textToOptions(e.target.value),
                            }))
                          }
                          className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                          placeholder={"Option label|option_value"}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          One option per line. Use `label|value`. Leave empty for
                          a single yes/no checkbox.
                        </p>
                      </label>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isFieldsMode && tab === "en" ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
            Field labels use the Vietnamese schema. Translate the name, submit
            button, and success message above for English.
          </div>
        ) : null}

        {formId ? (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Move to trash
            </button>
          </div>
        ) : null}
      </div>
      {markdownFullscreen && isMarkdownMode ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-label="Markdown layout editor"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-lg font-semibold">
                Markdown layout ({tab.toUpperCase()})
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                aria-label="Markdown syntax help"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-400 text-[11px] font-semibold leading-none text-gray-600 hover:border-gray-700 hover:text-gray-900"
              >
                i
              </button>
              <div className="flex rounded border border-gray-300 p-0.5">
                <button
                  type="button"
                  onClick={() => setMarkdownView("edit")}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    markdownView === "edit"
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setMarkdownView("preview")}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    markdownView === "preview"
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMarkdownFullscreen(false)}
              aria-label="Collapse markdown editor"
              title="Collapse"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-600 hover:border-gray-500 hover:bg-gray-50 hover:text-gray-900"
            >
              <CollapseIcon />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6">
            {markdownView === "edit" ? (
              <>
                <textarea
                  autoFocus
                  value={locale.schemaMarkdown ?? ""}
                  onChange={(e) => {
                    setMarkdownError(null);
                    updateLocale((current) => ({
                      ...current,
                      schemaMarkdown: e.target.value,
                    }));
                  }}
                  className="min-h-0 w-full flex-1 resize-none rounded border border-gray-300 px-4 py-3 font-mono text-sm leading-6"
                />
                {markdownError ? (
                  <p className="mt-2 shrink-0 text-sm text-red-700">
                    {markdownError}
                  </p>
                ) : null}
              </>
            ) : markdownPreview && "error" in markdownPreview ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {markdownPreview.error}
              </p>
            ) : markdownPreview && "form" in markdownPreview ? (
              <div className="mx-auto w-full max-w-3xl rounded-lg border border-gray-200 bg-[var(--background,#fff)] p-4 sm:p-6">
                <FormPreviewI18n locale={tab}>
                  <PublicFormBlock form={markdownPreview.form} preview />
                </FormPreviewI18n>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {helpOpen ? <MarkdownHelpModal onClose={() => setHelpOpen(false)} /> : null}
      {modal}
    </>
  );
}
