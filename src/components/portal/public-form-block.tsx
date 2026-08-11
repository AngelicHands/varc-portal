"use client";

import { useMemo, useState } from "react";
import type { PublicFormDefinition } from "@/lib/forms";

type Props = {
  form: PublicFormDefinition;
};

type SubmitState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function fieldClass(width: "full" | "half") {
  return width === "half" ? "md:col-span-1" : "md:col-span-2";
}

export function PublicFormBlock({ form }: Props) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      form.fields.map((field) => [field.name, field.type === "checkbox" ? false : ""]),
    ),
  );
  const [state, setState] = useState<SubmitState>({ type: "idle" });

  const pagePath = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.pathname}${window.location.search}`;
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ type: "submitting" });

    try {
      const res = await fetch(`/api/forms/${form.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values,
          pagePath,
          website: "",
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setState({
          type: "error",
          message: json?.error || "Failed to submit the form",
        });
        return;
      }
      setState({
        type: "success",
        message: json.message || form.successMessage,
      });
      setValues(
        Object.fromEntries(
          form.fields.map((field) => [field.name, field.type === "checkbox" ? false : ""]),
        ),
      );
    } catch {
      setState({
        type: "error",
        message: "Failed to submit the form",
      });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm md:p-6">
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
        <form onSubmit={onSubmit} className="space-y-5">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />
          <div className="grid gap-4 md:grid-cols-2">
            {form.fields.map((field) => {
              const value = values[field.name];
              const commonTextClass =
                "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900";

              return (
                <div key={field.id} className={fieldClass(field.width)}>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-foreground">
                      {field.label}
                      {field.required ? (
                        <span className="ml-1 text-red-600">*</span>
                      ) : null}
                    </span>

                    {field.type === "textarea" ? (
                      <textarea
                        rows={5}
                        required={field.required}
                        value={typeof value === "string" ? value : ""}
                        placeholder={field.placeholder}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                        className={commonTextClass}
                      />
                    ) : null}

                    {field.type === "select" ? (
                      <select
                        required={field.required}
                        value={typeof value === "string" ? value : ""}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
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
                      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                        {field.options.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="radio"
                              name={field.name}
                              required={field.required}
                              checked={value === option.value}
                              onChange={() =>
                                setValues((prev) => ({
                                  ...prev,
                                  [field.name]: option.value,
                                }))
                              }
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {field.type === "checkbox" ? (
                      <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3">
                        <input
                          type="checkbox"
                          checked={value === true}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [field.name]: e.target.checked,
                            }))
                          }
                        />
                        <span className="text-sm leading-6 text-foreground">
                          {field.placeholder || field.helpText || field.label}
                        </span>
                      </label>
                    ) : null}

                    {field.type !== "textarea" &&
                    field.type !== "select" &&
                    field.type !== "radio" &&
                    field.type !== "checkbox" ? (
                      <input
                        type={
                          field.type === "email"
                            ? "email"
                            : field.type === "phone"
                              ? "tel"
                              : field.type === "date"
                                ? "date"
                                : "text"
                        }
                        required={field.required}
                        value={typeof value === "string" ? value : ""}
                        placeholder={field.placeholder}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                        className={commonTextClass}
                      />
                    ) : null}
                  </label>

                  {field.helpText && field.type !== "checkbox" ? (
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      {field.helpText}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {state.type === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={state.type === "submitting"}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
          >
            {state.type === "submitting" ? "Sending..." : form.submitLabel}
          </button>
        </form>
      )}
    </div>
  );
}
