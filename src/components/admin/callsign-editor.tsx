"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCallsignAction,
  updateCallsignAction,
} from "@/lib/callsign-actions";
import { notifyAction } from "@/components/admin/admin-toast";
import type { AdminCallsignRecord } from "@/lib/callsigns-admin";
import type { CallsignFormValues } from "@/lib/validations/callsigns";

type LicenseDraft = CallsignFormValues["licenses"][number];

const emptyLicense = (): LicenseDraft => ({
  permitRaw: "",
  permitType: "GP",
  issuedAt: "",
  expiresAt: "",
  notes: "",
});

function toFormValues(record?: AdminCallsignRecord | null): CallsignFormValues {
  if (!record) {
    return {
      sign: "",
      operatorName: "",
      operatorKind: "person",
      licenses: [emptyLicense()],
    };
  }
  return {
    sign: record.sign,
    operatorName: record.operatorName,
    operatorKind: record.operatorKind === "org" ? "org" : "person",
    licenses: record.licenses.length
      ? record.licenses.map((row) => ({
          id: row.id,
          permitRaw: row.permitRaw,
          permitType:
            row.permitType === "GP" ||
            row.permitType === "GH" ||
            row.permitType === "VARC" ||
            row.permitType === "unknown" ||
            row.permitType === "missing"
              ? row.permitType
              : "unknown",
          issuedAt: row.issuedAt ?? "",
          expiresAt: row.expiresAt ?? "",
          notes: row.notes,
        }))
      : [emptyLicense()],
  };
}

export function CallsignEditor({
  record,
  onSaved,
  onCancel,
  embedded = false,
}: {
  record?: AdminCallsignRecord | null;
  onSaved?: (sign: string) => void;
  onCancel?: () => void;
  embedded?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<CallsignFormValues>(() =>
    toFormValues(record),
  );

  function updateLicense(index: number, patch: Partial<LicenseDraft>) {
    setValues((current) => ({
      ...current,
      licenses: current.licenses.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const payload = {
          ...values,
          licenses: values.licenses.map((row) => ({
            ...row,
            issuedAt: row.issuedAt || null,
            expiresAt: row.expiresAt || null,
          })),
        };
        startTransition(async () => {
          const result = editing
            ? await updateCallsignAction(record!.sign, payload)
            : await createCallsignAction(payload);
          if (
            !notifyAction(
              result,
              editing ? "Callsign saved" : "Callsign created",
            )
          ) {
            setError(result.error);
            return;
          }
          router.refresh();
          if (onSaved) {
            onSaved(result.sign);
            return;
          }
          router.push(`/admin/callsigns/${result.sign}`);
        });
      }}
    >
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div
        className={
          embedded
            ? "grid gap-4 md:grid-cols-2"
            : "grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2"
        }
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Callsign</span>
          <input
            value={values.sign}
            onChange={(e) =>
              setValues((current) => ({
                ...current,
                sign: e.target.value.toUpperCase(),
              }))
            }
            required
            disabled={editing}
            placeholder="XV2T"
            className="w-full rounded border border-gray-300 px-3 py-2 font-mono uppercase disabled:bg-gray-50"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Operator kind</span>
          <select
            value={values.operatorKind}
            onChange={(e) =>
              setValues((current) => ({
                ...current,
                operatorKind: e.target.value as "person" | "org",
              }))
            }
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="person">Person</option>
            <option value="org">Club / organization</option>
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Operator name</span>
          <input
            value={values.operatorName}
            onChange={(e) =>
              setValues((current) => ({
                ...current,
                operatorName: e.target.value,
              }))
            }
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold">Licenses</p>
          <button
            type="button"
            className="text-sm text-gray-700 hover:underline"
            onClick={() =>
              setValues((current) => ({
                ...current,
                licenses: [emptyLicense(), ...current.licenses],
              }))
            }
          >
            Add license event
          </button>
        </div>
        {values.licenses.map((license, index) => (
          <div
            key={license.id ?? `new-${index}`}
            className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-2"
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Permit number</span>
              <input
                value={license.permitRaw}
                onChange={(e) =>
                  updateLicense(index, { permitRaw: e.target.value })
                }
                placeholder="313994/GP"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Type</span>
              <select
                value={license.permitType ?? "GP"}
                onChange={(e) =>
                  updateLicense(index, {
                    permitType: e.target.value as LicenseDraft["permitType"],
                  })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="GP">New permit (GP)</option>
                <option value="GH">Renewal (GH)</option>
                <option value="VARC">VARC</option>
                <option value="unknown">Unknown</option>
                <option value="missing">Missing number</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Issued</span>
              <input
                type="date"
                value={license.issuedAt ?? ""}
                onChange={(e) =>
                  updateLicense(index, { issuedAt: e.target.value })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Expires</span>
              <input
                type="date"
                value={license.expiresAt ?? ""}
                onChange={(e) =>
                  updateLicense(index, { expiresAt: e.target.value })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium">Notes</span>
              <input
                value={license.notes}
                onChange={(e) =>
                  updateLicense(index, { notes: e.target.value })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            {values.licenses.length > 1 ? (
              <div className="md:col-span-2">
                <button
                  type="button"
                  className="text-sm text-red-700 hover:underline"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      licenses: current.licenses.filter((_, i) => i !== index),
                    }))
                  }
                >
                  Remove this event
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save callsign" : "Create callsign"}
        </button>
      </div>
    </form>
  );
}
