"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFormDefinitionAction,
  saveFormDefinitionAction,
} from "@/lib/actions";
import {
  emptyFormField,
  parseFormSchemaMarkdown,
  type FormDefinitionFormValues,
  type FormFieldDefinition,
  type FormFieldType,
} from "@/lib/validations/forms";
import { makeSlug } from "@/lib/slug";
import { notifyAction } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";

const FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Radio" },
  { value: "date", label: "Date" },
  { value: "image", label: "Image upload" },
  { value: "file", label: "File upload" },
];

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
              Write normal markdown for the layout. Insert inputs only where
              needed with <code>#![…]</code> placeholders. If the markdown box
              is filled, it becomes the source of truth for fields.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Input types</h3>
            <p>
              <code>text</code>, <code>textarea</code>, <code>email</code>,{" "}
              <code>phone</code>, <code>select</code>, <code>checkbox</code>,{" "}
              <code>radio</code>, <code>date</code>, <code>image</code>,{" "}
              <code>file</code>
            </p>
            <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800">
{`Your name: #![text:{full_name}:"Your name":{style:underline,required:true,suggestion:"Enter your legal name"}]
Email: #![email:{email}:"name@example.com":{required:true}]
ID photo: #![image:{id_photo}:{required:true,suggestion:"JPEG or PNG"}]
Resume: #![file:{resume}:{suggestion:"PDF preferred"}]
- #![checkbox:{topics}-DX]
- #![checkbox:{topics}-Emergency comms]
Choose region: #![select:{region}-North]
#![select:{region}-South]`}
            </pre>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900">Attributes</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code>required:true</code> — required field
              </li>
              <li>
                <code>suggestion:&quot;…&quot;</code> or{" "}
                <code>help:&quot;…&quot;</code> — shown under an (i) icon on the
                public form
              </li>
              <li>
                <code>style:default|borderless|underline|dotted_underline</code>
              </li>
              <li>
                <code>:&quot;placeholder text&quot;</code> — input placeholder
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

type FormEditorState = Omit<FormDefinitionFormValues, "fields"> & {
  fields: FormFieldDefinition[];
};

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

export function FormDefinitionEditor({ formId, initial }: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [markdownSchema, setMarkdownSchema] = useState(initial.schemaMarkdown ?? "");
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const [form, setForm] = useState<FormEditorState>({
    ...initial,
    fields: (initial.fields ?? []).map((field) => ({
      id: field.id,
      type: field.type,
      name: field.name,
      label: field.label,
      required: field.required,
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? "",
      width: field.width ?? "full",
      style: field.style ?? "default",
      options: field.options ?? [],
    })),
  });

  const keyPreview = useMemo(() => {
    return initial.key || (form.name.trim() ? makeSlug(form.name) : "(assigned on save)");
  }, [form.name, initial.key]);

  function setField(
    fieldId: string,
    updater: (field: FormFieldDefinition) => FormFieldDefinition,
  ) {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.map((field) =>
        field.id === fieldId ? updater(field) : field,
      ),
    }));
  }

  function addField(type: FormFieldType) {
    setForm((prev) => ({
      ...prev,
      fields: [...prev.fields, emptyFormField(type)],
    }));
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    setForm((prev) => {
      const fields = [...prev.fields];
      const index = fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= fields.length) return prev;
      const [item] = fields.splice(index, 1);
      if (!item) return prev;
      fields.splice(nextIndex, 0, item);
      return { ...prev, fields };
    });
  }

  function removeField(fieldId: string) {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((field) => field.id !== fieldId),
    }));
  }

  function onSave(status: "draft" | "published") {
    setError(null);
    if (markdownSchema.trim()) {
      const parsed = parseFormSchemaMarkdown(markdownSchema);
      if (!parsed.ok) {
        setMarkdownError(parsed.error);
        return;
      }
      setMarkdownError(null);
      const nextForm = {
        ...form,
        status,
        schemaMarkdown: markdownSchema,
        fields: parsed.fields,
      };
      startTransition(async () => {
        const result = await saveFormDefinitionAction(formId ?? null, nextForm);
        if (!notifyAction(result, status === "published" ? "Form published" : "Form saved")) {
          setError(result.error);
          return;
        }
        router.push(`/admin/forms/${result.id}`);
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      const result = await saveFormDefinitionAction(formId ?? null, {
        ...form,
        status,
        schemaMarkdown: "",
      });
      if (!notifyAction(result, status === "published" ? "Form published" : "Form saved")) {
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

  return (
    <>
      <div className="space-y-6">
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">
              Reusable forms can be embedded in page and template layouts.
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

        <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="block text-sm">
            <span className="mb-1 block font-medium">Key</span>
            <p className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 font-mono text-gray-600">
              {keyPreview}
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Submit button</span>
            <input
              value={form.submitLabel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, submitLabel: e.target.value }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Description</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Success message</span>
            <textarea
              rows={2}
              value={form.successMessage}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, successMessage: e.target.value }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
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
              <p className="mt-1 text-sm text-gray-500">
                Optional markdown layout. When filled, it becomes the source of
                truth for this form.
              </p>
            </div>
          </div>
          <textarea
            rows={8}
            value={markdownSchema}
            onChange={(e) => {
              setMarkdownSchema(e.target.value);
              setMarkdownError(null);
            }}
            className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          {markdownError ? (
            <p className="mt-2 text-sm text-red-700">{markdownError}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Field schema</h2>
              <p className="text-sm text-gray-500">
                Use this when you do not want a markdown layout.
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
            {form.fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">
                    Field {index + 1} ·{" "}
                    {FIELD_TYPES.find((item) => item.value === field.type)?.label}
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
                    <span className="mb-1 block text-sm font-medium">Width</span>
                    <select
                      value={field.width}
                      onChange={(e) =>
                        setField(field.id, (current) => ({
                          ...current,
                          width: e.target.value as "full" | "half",
                        }))
                      }
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    >
                      <option value="full">Full width</option>
                      <option value="half">Half width</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Input style</span>
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
                    <span className="mb-1 block text-sm font-medium">Field key</span>
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
                    <span className="mb-1 block text-sm font-medium">Placeholder</span>
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
                        value={optionsToText(field.options)}
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
                        One option per line. Use `label|value`. Leave empty for a single yes/no checkbox.
                      </p>
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

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
      {helpOpen ? <MarkdownHelpModal onClose={() => setHelpOpen(false)} /> : null}
      {modal}
    </>
  );
}
