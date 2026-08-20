"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { usePortalConfirm } from "@/components/portal/use-confirm";
import type { QsoListItemDto } from "@/lib/account-types";
import {
  convertQsoDateTimeParts,
  formatQsoDateTime,
  fromQsoDateTimeParts,
  qsoDateTimeNow,
  toQsoDateValue,
  toQsoTimeValue,
  type QsoTimeZoneMode,
} from "@/lib/qso-datetime";
import {
  createQsoAction,
  deleteQsoAction,
  updateQsoAction,
} from "@/lib/qso-actions";
import {
  QSO_BANDS,
  QSO_MODES,
  isValidFreqMhzInput,
  normalizeFreqMhzInput,
  type QsoInputValues,
  type QsoMode,
} from "@/lib/validations/qso";

type Props = {
  initialQsos: QsoListItemDto[];
  stationCallsign: string;
  canEdit?: boolean;
  canLogWithOperator?: boolean;
};

type SortKey = "qsoAt" | "workedCallsign" | "band" | "mode" | "grid";
type SortDir = "asc" | "desc";

type FormState = Omit<QsoInputValues, "qsoAt" | "freqMhz"> & {
  qsoDate: string;
  qsoTime: string;
  freqMhz: string;
};

type QsoFieldKey =
  | "workedCallsign"
  | "qsoDate"
  | "qsoTime"
  | "freqMhz"
  | "grid";

type FieldErrors = Partial<Record<QsoFieldKey, boolean>>;

function mandatoryFieldErrors(
  form: FormState,
  zone: QsoTimeZoneMode,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.workedCallsign.trim()) {
    errors.workedCallsign = true;
  }

  const qsoAt = fromQsoDateTimeParts(form.qsoDate, form.qsoTime, zone);
  if (!form.qsoDate.trim()) {
    errors.qsoDate = true;
  }
  if (!form.qsoTime.trim()) {
    errors.qsoTime = true;
  }
  if (!qsoAt && form.qsoDate.trim() && form.qsoTime.trim()) {
    errors.qsoDate = true;
    errors.qsoTime = true;
  }

  if (!isValidFreqMhzInput(form.freqMhz)) {
    errors.freqMhz = true;
  }

  if (!form.grid.trim()) {
    errors.grid = true;
  }

  return errors;
}

function fieldInputClass(invalid: boolean, extra = "") {
  return [
    "w-full rounded-md px-3 py-2",
    extra,
    invalid
      ? "border border-red-500 outline-none ring-2 ring-red-200"
      : "border border-border",
  ]
    .filter(Boolean)
    .join(" ");
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
    >
      <path d="M16.5 5.5 8.5 14 4 9.5" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M3.75 13.75 3 17l3.25-.75L15.5 7 13 4.5l-9.25 9.25Z" />
      <path d="m11.75 5.75 2.5 2.5" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M4.5 6.25h11" />
      <path d="M8 3.75h4" />
      <path d="M6.25 6.25 7 16.25h6l.75-10" />
      <path d="M8.5 8.5v5" />
      <path d="M11.5 8.5v5" />
    </svg>
  );
}

function emptyForm(
  zone: QsoTimeZoneMode = "utc",
  workedCallsign = "",
): FormState {
  const { date, time } = qsoDateTimeNow(zone);
  return {
    workedCallsign: workedCallsign.trim().toUpperCase(),
    qsoDate: date,
    qsoTime: time,
    band: "20m",
    freqMhz: "",
    mode: "SSB",
    rstSent: "59",
    rstRcvd: "59",
    qso_sent: true,
    grid: "",
    notes: "",
  };
}

function formFromItem(
  item: QsoListItemDto,
  zone: QsoTimeZoneMode = "utc",
): FormState {
  return {
    workedCallsign: item.workedCallsign,
    qsoDate: toQsoDateValue(item.qsoAt, zone),
    qsoTime: toQsoTimeValue(item.qsoAt, zone),
    band: item.band as QsoInputValues["band"],
    freqMhz: item.freqMhz != null ? String(item.freqMhz) : "",
    mode: item.mode as QsoMode,
    rstSent: item.rstSent,
    rstRcvd: item.rstRcvd,
    qso_sent: item.qso_sent,
    grid: item.grid,
    notes: item.notes,
  };
}

function modeOptions(current?: string): string[] {
  const options = new Set<string>(QSO_MODES);
  if (current && !options.has(current)) {
    options.add(current);
  }
  return [...options];
}

function sortIndicator(active: boolean, dir: SortDir): string {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

const QSO_EMAIL_LIMIT_WARNING_KEY = "qso-email-limit-warning";
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

export function QsoLogbook({
  initialQsos,
  stationCallsign,
  canEdit = true,
  canLogWithOperator = false,
}: Props) {
  const t = useTranslations("logbook");
  const { ask, modal: confirmModal } = usePortalConfirm();
  const [qsos, setQsos] = useState(initialQsos);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm("utc"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [timeZoneMode, setTimeZoneMode] = useState<QsoTimeZoneMode>("utc");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [warning] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem(QSO_EMAIL_LIMIT_WARNING_KEY);
    if (!stored) return null;
    sessionStorage.removeItem(QSO_EMAIL_LIMIT_WARNING_KEY);
    return stored;
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("qsoAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const pending = isSubmitting || isDeleting;

  const filteredSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = qsos;

    if (query) {
      items = items.filter((item) => {
        const haystack = [
          item.workedCallsign,
          item.band,
          item.mode,
          item.grid,
          item.notes,
          item.qso_sent ? t("qsoSent") : "",
          item.qso_confirmed ? t("qsoConfirmed") : "",
          formatQsoDateTime(item.qsoAt),
          `${item.rstSent}/${item.rstRcvd}`,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    return [...items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "qsoAt") {
        cmp = a.qsoAt.localeCompare(b.qsoAt);
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey], undefined, {
          sensitivity: "base",
        });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [qsos, search, sortKey, sortDir, t]);

  const totalItems = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, currentPage, pageSize]);

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  function clearFieldErrors(...fields: QsoFieldKey[]) {
    if (fields.length === 0) return;
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of fields) {
        delete next[field];
      }
      return next;
    });
  }

  function openCreateModal() {
    setEditingId(null);
    setTimeZoneMode("utc");
    setForm(emptyForm("utc"));
    setError(null);
    setSuccessMessage(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  function openLogWithOperatorModal() {
    setEditingId(null);
    setTimeZoneMode("utc");
    setForm(emptyForm("utc", stationCallsign));
    setError(null);
    setSuccessMessage(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEditModal(item: QsoListItemDto) {
    setEditingId(item.id);
    setTimeZoneMode("utc");
    setForm(formFromItem(item, "utc"));
    setError(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  function switchTimeZone(nextZone: QsoTimeZoneMode) {
    if (nextZone === timeZoneMode) return;
    const converted = convertQsoDateTimeParts(
      form.qsoDate,
      form.qsoTime,
      timeZoneMode,
      nextZone,
    );
    if (converted) {
      setForm((prev) => ({
        ...prev,
        qsoDate: converted.date,
        qsoTime: converted.time,
      }));
    }
    setTimeZoneMode(nextZone);
  }

  function resetModal() {
    setModalOpen(false);
    setEditingId(null);
    setError(null);
    setFieldErrors({});
  }

  function closeModal() {
    if (pending) return;
    resetModal();
  }

  function toggleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "qsoAt" ? "desc" : "asc");
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const nextFieldErrors = mandatoryFieldErrors(form, timeZoneMode);
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(t("fixFields"));
      return;
    }
    setFieldErrors({});

    const qsoAt = fromQsoDateTimeParts(
      form.qsoDate,
      form.qsoTime,
      timeZoneMode,
    );
    if (!qsoAt) {
      setFieldErrors({ qsoDate: true, qsoTime: true });
      setError(t("invalidDateTime"));
      return;
    }

    const payload: QsoInputValues = {
      workedCallsign: form.workedCallsign,
      qsoAt,
      band: form.band,
      freqMhz: Number(form.freqMhz.trim()),
      mode: form.mode,
      rstSent: form.rstSent,
      rstRcvd: form.rstRcvd,
      qso_sent: form.qso_sent,
      grid: form.grid,
      notes: form.notes,
    };

    setIsSubmitting(true);
    void (async () => {
      try {
        const result = editingId
          ? await updateQsoAction(editingId, payload)
          : await createQsoAction(payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (
          "warning" in result &&
          result.warning?.code === "email_limit_reached"
        ) {
          sessionStorage.setItem(
            QSO_EMAIL_LIMIT_WARNING_KEY,
            t("emailLimitReached", { limit: result.warning.limit }),
          );
        }
        if (editingId) {
          setQsos((current) =>
            current.map((item) =>
              item.id === result.qso.id ? result.qso : item,
            ),
          );
        } else if (canEdit) {
          setQsos((current) => [result.qso, ...current]);
        } else {
          setSuccessMessage(
            t("qsoLoggedWithOperator", { callsign: stationCallsign }),
          );
        }
        resetModal();
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  async function onDelete(id: string) {
    const confirmed = await ask({
      title: t("delete"),
      message: t("confirmDelete"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      variant: "danger",
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const result = await deleteQsoAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQsos((current) => current.filter((item) => item.id !== id));
    } finally {
      setIsDeleting(false);
    }
  }

  function renderForm() {
    return (
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">{t("workedCallsign")}</span>
          <input
            required
            aria-invalid={Boolean(fieldErrors.workedCallsign)}
            value={form.workedCallsign}
            onChange={(e) => {
              clearFieldErrors("workedCallsign");
              setForm((prev) => ({
                ...prev,
                workedCallsign: e.target.value.toUpperCase(),
              }));
            }}
            className={fieldInputClass(Boolean(fieldErrors.workedCallsign), "uppercase")}
          />
        </label>
        <fieldset className="md:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <legend className="text-sm font-medium">
              {t("dateTime")}{" "}
              <span className="font-normal text-muted">
                {timeZoneMode === "utc" ? t("timeZoneUtc") : t("timeZoneLocal")}
              </span>
            </legend>
            <button
              type="button"
              onClick={() =>
                switchTimeZone(timeZoneMode === "utc" ? "local" : "utc")
              }
              className="shrink-0 text-right text-xs font-normal text-accent hover:underline"
            >
              {timeZoneMode === "utc"
                ? t("switchToLocalTime")
                : t("switchToUtc")}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">{t("date")}</span>
              <input
                type="date"
                required
                aria-invalid={Boolean(fieldErrors.qsoDate)}
                value={form.qsoDate}
                onChange={(e) => {
                  clearFieldErrors("qsoDate", "qsoTime");
                  setForm((prev) => ({ ...prev, qsoDate: e.target.value }));
                }}
                className={fieldInputClass(Boolean(fieldErrors.qsoDate))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">{t("time")}</span>
              <input
                type="time"
                step={1}
                required
                aria-invalid={Boolean(fieldErrors.qsoTime)}
                value={form.qsoTime}
                onChange={(e) => {
                  clearFieldErrors("qsoDate", "qsoTime");
                  setForm((prev) => ({ ...prev, qsoTime: e.target.value }));
                }}
                className={fieldInputClass(Boolean(fieldErrors.qsoTime))}
              />
            </label>
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("band")}</span>
          <select
            value={form.band}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                band: e.target.value as QsoInputValues["band"],
              }))
            }
            className="w-full rounded-md border border-border px-3 py-2"
          >
            {QSO_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("freqMhz")}</span>
          <input
            type="text"
            inputMode="decimal"
            required
            aria-invalid={Boolean(fieldErrors.freqMhz)}
            value={form.freqMhz}
            onChange={(e) => {
              clearFieldErrors("freqMhz");
              setForm((prev) => ({
                ...prev,
                freqMhz: normalizeFreqMhzInput(e.target.value),
              }));
            }}
            className={fieldInputClass(Boolean(fieldErrors.freqMhz))}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("mode")}</span>
          <select
            required
            value={form.mode}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                mode: e.target.value as QsoMode,
              }))
            }
            className="w-full rounded-md border border-border px-3 py-2"
          >
            {modeOptions(form.mode).map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("grid")}</span>
          <input
            required
            aria-invalid={Boolean(fieldErrors.grid)}
            value={form.grid}
            placeholder={t("gridPlaceholder")}
            onChange={(e) => {
              clearFieldErrors("grid");
              setForm((prev) => ({
                ...prev,
                grid: e.target.value.toUpperCase(),
              }));
            }}
            className={fieldInputClass(Boolean(fieldErrors.grid), "uppercase")}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("rstSent")}</span>
          <input
            value={form.rstSent}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, rstSent: e.target.value }))
            }
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("rstRcvd")}</span>
          <input
            value={form.rstRcvd}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, rstRcvd: e.target.value }))
            }
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">{t("notes")}</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </label>

        {error ? (
          <p className="md:col-span-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="md:col-span-2 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("saving") : editingId ? t("update") : t("add")}
          </button>
          <button
            type="button"
            onClick={closeModal}
            disabled={pending}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-6">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {t("stationCallsign", { callsign: stationCallsign })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t("addQso")}
            </button>
            {/* API download — not a Next.js page route */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/account/qso/export"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5"
            >
              {t("exportAdif")}
            </a>
          </div>
        </div>
      ) : null}

      {canLogWithOperator ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={openLogWithOperatorModal}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t("logQsoWithOperator")}
          </button>
        </div>
      ) : null}

      {warning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}
      {successMessage ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {successMessage}
        </p>
      ) : null}

      {qsos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="max-w-md text-muted">
            {t("emptyFor", { callsign: stationCallsign })}
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-6 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              {t("addQso")}
            </button>
          ) : canLogWithOperator ? (
            <button
              type="button"
              onClick={openLogWithOperatorModal}
              className="mt-6 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              {t("logQsoWithOperator")}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("searchPlaceholder")}
              className="min-w-[12rem] flex-1 rounded-md border border-border px-3 py-2 text-sm"
            />
            <p className="text-sm text-muted">
              {totalItems > 0
                ? t("showingRange", {
                    start: rangeStart,
                    end: rangeEnd,
                    total: totalItems,
                  })
                : t("resultCount", { count: 0 })}
            </p>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span>{t("rowsPerPage")}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-foreground/5 text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("workedCallsign")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("workedCallsign")}
                      <span aria-hidden>
                        {sortIndicator(sortKey === "workedCallsign", sortDir)}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("qsoAt")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("dateTime")}
                      <span aria-hidden>
                        {sortIndicator(sortKey === "qsoAt", sortDir)}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("band")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("band")}
                      <span aria-hidden>
                        {sortIndicator(sortKey === "band", sortDir)}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("mode")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("mode")}
                      <span aria-hidden>
                        {sortIndicator(sortKey === "mode", sortDir)}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort("grid")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("grid")}
                      <span aria-hidden>
                        {sortIndicator(sortKey === "grid", sortDir)}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">{t("rst")}</th>
                  <th className="px-3 py-2 font-medium">{t("status")}</th>
                  {canEdit ? (
                    <th className="px-3 py-2 font-medium">{t("actions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredSorted.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="px-3 py-8 text-center text-muted">
                      {t("noSearchResults")}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/70">
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {item.workedCallsign}
                          {item.qso_confirmed ? (
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700"
                              title={t("qsoConfirmed")}
                              aria-label={t("qsoConfirmed")}
                            >
                              <CheckIcon />
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatQsoDateTime(item.qsoAt)}
                      </td>
                      <td className="px-3 py-2">{item.band}</td>
                      <td className="px-3 py-2">{item.mode}</td>
                      <td className="px-3 py-2 font-mono uppercase">{item.grid}</td>
                      <td className="px-3 py-2">
                        {item.rstSent}/{item.rstRcvd}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {item.qso_confirmed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                              <CheckIcon />
                              {t("qsoConfirmed")}
                            </span>
                          ) : item.qso_sent ? (
                            <span className="rounded-full bg-foreground/8 px-2 py-1 text-xs font-medium text-foreground">
                              {t("qsoSent")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">{t("statusPending")}</span>
                          )}
                        </div>
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              aria-label={t("edit")}
                              title={t("edit")}
                              className="rounded-md p-2 text-accent hover:bg-accent/10"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => onDelete(item.id)}
                              aria-label={t("delete")}
                              title={t("delete")}
                              className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
              aria-label={t("pagination")}
            >
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-foreground/5 disabled:pointer-events-none disabled:opacity-40"
              >
                {t("previous")}
              </button>
              <span className="text-muted">
                {t("pageOf", { page: currentPage, totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-foreground/5 disabled:pointer-events-none disabled:opacity-40"
              >
                {t("next")}
              </button>
            </nav>
          ) : null}
        </>
      )}

      {canEdit || canLogWithOperator ? (
        <PortalDialog
          open={modalOpen}
          title={
            editingId
              ? t("editQso")
              : canLogWithOperator && !canEdit
                ? t("logQsoWithOperator")
                : t("addQso")
          }
          onClose={closeModal}
          closeDisabled={pending}
          size="lg"
        >
          {renderForm()}
        </PortalDialog>
      ) : null}

      {confirmModal}
    </div>
  );
}
