"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCallsignAction,
  deleteCallsignLicenseAction,
  saveCallsignLicenseAction,
  updateCallsignAction,
} from "@/lib/callsign-actions";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { TrashIcon } from "@/components/admin/admin-action-icons";
import { notifyAction } from "@/components/admin/admin-toast";
import { IconActionButton } from "@/components/admin/icon-action-button";
import { useConfirm } from "@/components/admin/use-confirm";
import type { AdminCallsignRecord } from "@/lib/callsigns-admin";
import type { CallsignFormValues } from "@/lib/validations/callsigns";

type LicenseDraft = CallsignFormValues["licenses"][number] & {
  clientKey: string;
  active?: boolean;
};

const PERMIT_TYPE_LABEL: Record<
  NonNullable<LicenseDraft["permitType"]>,
  string
> = {
  GP: "GP",
  GH: "GH",
  VARC: "VARC",
  unknown: "Unknown",
  missing: "Missing",
};

function emptyLicense(clientKey: string, operatorName = ""): LicenseDraft {
  return {
    operatorName,
    permitRaw: "",
    permitType: "GP",
    issuedAt: "",
    expiresAt: "",
    notes: "",
    clientKey,
    active: false,
  };
}

function licensesFromRecord(record: AdminCallsignRecord): LicenseDraft[] {
  return record.licenses.map((row) => ({
    id: row.id,
    operatorName: row.operatorName || record.operatorName || "",
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
    clientKey: row.id,
    active: row.active,
  }));
}

function toFormValues(
  record: AdminCallsignRecord | null | undefined,
): {
  sign: string;
  operatorName: string;
  operatorKind: CallsignFormValues["operatorKind"];
  licenses: LicenseDraft[];
} {
  if (!record) {
    return {
      sign: "",
      operatorName: "",
      operatorKind: "person",
      licenses: [],
    };
  }
  return {
    sign: record.sign,
    operatorName: record.operatorName,
    operatorKind: record.operatorKind === "org" ? "org" : "person",
    licenses: licensesFromRecord(record),
  };
}

function licenseSummary(license: LicenseDraft): string {
  const kind = PERMIT_TYPE_LABEL[license.permitType ?? "GP"];
  const operator = license.operatorName.trim() || "No operator";
  const permit = license.permitRaw.trim() || "No permit number";
  const issued = license.issuedAt || "—";
  const expires = license.expiresAt || "—";
  return `${operator} · ${kind} · ${permit} · ${issued} → ${expires}`;
}

function licensePayload(license: LicenseDraft) {
  return {
    id: license.id,
    operatorName: license.operatorName,
    permitRaw: license.permitRaw,
    permitType: license.permitType,
    issuedAt: license.issuedAt || null,
    expiresAt: license.expiresAt || null,
    notes: license.notes,
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 ${
        open ? "rotate-0" : "-rotate-90"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 10 6 6 6-6" />
    </svg>
  );
}

function LicenseEventFields({
  license,
  onChange,
}: {
  license: LicenseDraft;
  onChange: (patch: Partial<LicenseDraft>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block font-medium">Operator name</span>
        <input
          value={license.operatorName}
          onChange={(e) => onChange({ operatorName: e.target.value })}
          required
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Permit number</span>
        <input
          value={license.permitRaw}
          onChange={(e) => onChange({ permitRaw: e.target.value })}
          placeholder="313994/GP"
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Type</span>
        <select
          value={license.permitType ?? "GP"}
          onChange={(e) =>
            onChange({
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
          onChange={(e) => onChange({ issuedAt: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Expires</span>
        <input
          type="date"
          value={license.expiresAt ?? ""}
          onChange={(e) => onChange({ expiresAt: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="mb-1 block font-medium">Notes</span>
        <input
          value={license.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
    </div>
  );
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
  const { ask, modal } = useConfirm();
  const editing = Boolean(record);
  const idPrefix = useId();
  const [keySeq, setKeySeq] = useState(1);
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingSign, setExistingSign] = useState<string | null>(null);
  const [values, setValues] = useState(() => toFormValues(record));
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [addDraft, setAddDraft] = useState<LicenseDraft | null>(null);

  function nextClientKey() {
    const n = keySeq + 1;
    setKeySeq(n);
    return `${idPrefix}-${n}`;
  }

  function applyRecord(next: AdminCallsignRecord) {
    setValues((current) => ({
      ...current,
      operatorName: next.operatorName || current.operatorName,
      operatorKind:
        next.operatorKind === "org" || next.operatorKind === "person"
          ? next.operatorKind
          : current.operatorKind,
      licenses: licensesFromRecord(next),
    }));
  }

  function openAddModal() {
    setAddDraft(emptyLicense(nextClientKey(), values.operatorName));
  }

  function toggleLicense(key: string) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateLicense(index: number, patch: Partial<LicenseDraft>) {
    setValues((current) => ({
      ...current,
      licenses: current.licenses.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function removeLicense(index: number) {
    const key = values.licenses[index]?.clientKey;
    setValues((current) => ({
      ...current,
      licenses: current.licenses.filter((_, i) => i !== index),
    }));
    if (key) {
      setOpenKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function confirmRemoveLicense(index: number) {
    if (values.licenses.length <= 1) return;
    const license = values.licenses[index];
    if (!license) return;
    const confirmed = await ask({
      title: "Delete license event",
      message: `Delete “${licenseSummary(license)}”?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    if (editing && license.id) {
      const result = await deleteCallsignLicenseAction(record!.sign, license.id);
      if (!notifyAction(result, "License event deleted")) {
        setError(result.error);
        return;
      }
      removeLicense(index);
      router.refresh();
      return;
    }

    removeLicense(index);
  }

  async function saveLicenseEvent(license: LicenseDraft) {
    setError(null);
    if (editing) {
      const result = await saveCallsignLicenseAction(
        record!.sign,
        licensePayload(license),
      );
      if (!notifyAction(result, "License event saved")) {
        setError(result.error);
        return false;
      }
      if (result.record) applyRecord(result.record);
      router.refresh();
      return true;
    }

    setValues((current) => {
      const exists = current.licenses.some(
        (row) => row.clientKey === license.clientKey,
      );
      if (exists) {
        return {
          ...current,
          licenses: current.licenses.map((row) =>
            row.clientKey === license.clientKey ? license : row,
          ),
        };
      }
      return {
        ...current,
        licenses: [license, ...current.licenses],
      };
    });
    return true;
  }

  return (
    <>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setExistingSign(null);
          startTransition(async () => {
            if (editing) {
              const result = await updateCallsignAction(record!.sign, {
                sign: values.sign,
                operatorName: values.operatorName,
                operatorKind: values.operatorKind,
              });
              if (!notifyAction(result, "Callsign details saved")) {
                setError(result.error);
                return;
              }
              router.refresh();
              return;
            }

            if (values.licenses.length === 0) {
              setError("Add at least one license event");
              return;
            }
            const result = await createCallsignAction({
              sign: values.sign,
              operatorName: values.operatorName,
              operatorKind: values.operatorKind,
              licenses: values.licenses.map(licensePayload),
            });
            if (!notifyAction(result, "Callsign created")) {
              setError(result.error);
              const duplicate =
                "existingSign" in result &&
                typeof result.existingSign === "string"
                  ? result.existingSign
                  : null;
              setExistingSign(duplicate);
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
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            {existingSign ? (
              <button
                type="button"
                className="mt-2 font-medium underline underline-offset-2 hover:text-red-900"
                onClick={() => {
                  onCancel?.();
                  router.push(`/admin/callsigns/${existingSign}`);
                }}
              >
                Open {existingSign}
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={
            embedded
              ? "space-y-4"
              : "space-y-4 rounded-lg border border-gray-200 bg-white p-5"
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
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
          {editing ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
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
                {pending ? "Saving…" : "Save details"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">License events</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Each event has its own operator. Only a non-expired event can be
                Active; that event’s operator is the callsign’s current
                operator.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-sm text-gray-700 hover:underline"
              onClick={openAddModal}
            >
              Add license event
            </button>
          </div>
          {values.licenses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-600">
              No license events yet. Add one to continue.
            </p>
          ) : (
            <div className="space-y-2">
              {values.licenses.map((license, index) => {
                const open = openKeys.has(license.clientKey);
                const roleLabel = license.id
                  ? license.active
                    ? "Active"
                    : "Past"
                  : "New";
                const roleClass = license.id
                  ? license.active
                    ? "bg-green-50 text-green-800 ring-green-200"
                    : "bg-gray-100 text-gray-600 ring-gray-200"
                  : "bg-amber-50 text-amber-900 ring-amber-200";
                const busy = savingKey === license.clientKey;
                return (
                  <div
                    key={license.clientKey}
                    className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                  >
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleLicense(license.clientKey)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <Chevron open={open} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium text-gray-900">
                              {licenseSummary(license)}
                            </span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset ${roleClass}`}
                            >
                              {roleLabel}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            Event {index + 1} of {values.licenses.length}
                          </span>
                        </span>
                      </button>
                      {!open && values.licenses.length > 1 ? (
                        <IconActionButton
                          label="Delete license event"
                          variant="danger"
                          onClick={() => void confirmRemoveLicense(index)}
                        >
                          <TrashIcon />
                        </IconActionButton>
                      ) : null}
                    </div>
                    <div
                      className="admin-accordion-panel"
                      data-open={open ? "true" : "false"}
                    >
                      <div className="admin-accordion-panel-inner">
                        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
                          <LicenseEventFields
                            license={license}
                            onChange={(patch) => updateLicense(index, patch)}
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {values.licenses.length > 1 ? (
                              <button
                                type="button"
                                className="mr-auto text-sm text-red-700 hover:underline"
                                onClick={() => void confirmRemoveLicense(index)}
                              >
                                Remove this event
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setSavingKey(license.clientKey);
                                void saveLicenseEvent(license).then((ok) => {
                                  setSavingKey(null);
                                  if (!ok) return;
                                  setOpenKeys((current) => {
                                    const next = new Set(current);
                                    next.delete(license.clientKey);
                                    return next;
                                  });
                                });
                              }}
                              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
                            >
                              {busy ? "Saving…" : "Save event"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!editing ? (
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
              {pending ? "Saving…" : "Create callsign"}
            </button>
          </div>
        ) : null}
      </form>

      <AdminDialog
        open={Boolean(addDraft)}
        title="Add license event"
        onClose={() => setAddDraft(null)}
        closeDisabled={savingKey === addDraft?.clientKey}
      >
        {addDraft ? (
          <div className="space-y-4">
            <LicenseEventFields
              license={addDraft}
              onChange={(patch) =>
                setAddDraft((current) =>
                  current ? { ...current, ...patch } : current,
                )
              }
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={savingKey === addDraft.clientKey}
                onClick={() => setAddDraft(null)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingKey === addDraft.clientKey}
                onClick={() => {
                  const draft = addDraft;
                  setSavingKey(draft.clientKey);
                  void saveLicenseEvent(draft)
                    .then((ok) => {
                      if (ok) setAddDraft(null);
                    })
                    .finally(() => setSavingKey(null));
                }}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
              >
                {savingKey === addDraft.clientKey ? "Saving…" : "Save event"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminDialog>

      {modal}
    </>
  );
}
