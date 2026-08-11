"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFormDefinitionAction,
  saveFormDefinitionAction,
} from "@/lib/actions";
import {
  emptyFormField,
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
];

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
  const [form, setForm] = useState<FormEditorState>({
    ...initial,
    fields: initial.fields.map((field) => ({
      id: field.id,
      type: field.type,
      name: field.name,
      label: field.label,
      required: field.required,
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? "",
      width: field.width ?? "full",
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
    startTransition(async () => {
      const result = await saveFormDefinitionAction(formId ?? null, {
        ...form,
        status,
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fields</h2>
              <p className="text-sm text-gray-500">
                Supported: text, textarea, email, phone, select, checkbox, radio, date.
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
                            nextType === "select" || nextType === "radio"
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
                    <span className="mb-1 block text-sm font-medium">Help text</span>
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
                    />
                  </label>

                  {field.type === "select" || field.type === "radio" ? (
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
                        One option per line. Use `label|value`.
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
      {modal}
    </>
  );
}
