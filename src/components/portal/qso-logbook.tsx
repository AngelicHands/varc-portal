"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { usePortalConfirm } from "@/components/portal/use-confirm";
import { useSharedHomeGridAutofill } from "@/hooks/use-shared-home-grid-autofill";
import type { QsoListItemDto } from "@/lib/account-types";
import { hamPublicPath } from "@/lib/ham-reserved";
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
  adminDeleteQsoAction,
  createQsoAction,
  deleteAllUserQsosAction,
  deleteQsoAction,
  loadQsoLogbookPageAction,
  updateQsoAction,
} from "@/lib/qso-actions";
import { importQsoAdifAction, type AdifImportRecordError } from "@/lib/qso-import-actions";
import type { AdifImportErrorRef } from "@/lib/adif/import/error-keys";
import { translateAdifImportError } from "@/lib/adif/import/translate-error";
import type {
  QsoLogbookPageResult,
  QsoLogbookSortDir,
  QsoLogbookSortKey,
  QsoLogbookStatusFilter,
} from "@/lib/qso-logbook-query";
import {
  QSO_LOGBOOK_DEFAULT_PAGE_SIZE,
  QSO_LOGBOOK_PAGE_SIZES,
  hasQsoLogbookFilters,
  parseQsoLogbookBandFilter,
  parseQsoLogbookModeFilter,
  parseQsoLogbookPageSize,
  parseQsoLogbookSortDir,
  parseQsoLogbookSortKey,
  parseQsoLogbookSourceFilter,
  parseQsoLogbookStatusFilter,
} from "@/lib/qso-logbook-query";
import { QSO_SOURCES } from "@/lib/qso-source";
import {
  QSO_BANDS,
  QSO_MODES,
  isValidFreqMhzInput,
  normalizeFreqMhzInput,
  suggestedFreqMhzForModeBand,
  type QsoInputValues,
  type QsoMode,
} from "@/lib/validations/qso";

type Props = {
  logbookUserId: string;
  stationCallsign: string;
  /** Optional SSR snapshot when opening ?tab=logbook directly. */
  initialPage?: QsoLogbookPageResult | null;
  canEdit?: boolean;
  canLogWithOperator?: boolean;
  canAdminManage?: boolean;
};

type SortKey = QsoLogbookSortKey;
type SortDir = QsoLogbookSortDir;

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

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M10 4v12" />
      <path d="M4 10h12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M10 3v10" />
      <path d="m6.5 9.5 3.5 3.5 3.5-3.5" />
      <path d="M4 16h12" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M10 13V3" />
      <path d="m6.5 6.5 3.5-3.5 3.5 3.5" />
      <path d="M4 16h12" />
    </svg>
  );
}

const btnPrimaryClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-foreground px-2.5 py-2 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60 sm:px-3";
const btnSecondaryClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-foreground/20 bg-background px-2.5 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5 disabled:opacity-60 sm:px-3";
const btnDangerClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-foreground/20 bg-background px-2.5 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5 disabled:opacity-60 sm:px-3";
const btnLabelClass = "hidden sm:inline";
const filterSelectClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground";

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
    workedName: "",
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
    workedName: item.workedName,
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

function buildLogbookHref(
  callsign: string,
  params: {
    page: number;
    pageSize: number;
    search: string;
    band: string;
    mode: string;
    status: QsoLogbookStatusFilter;
    source: string;
    sortKey: SortKey;
    sortDir: SortDir;
  },
): string {
  const sp = new URLSearchParams();
  sp.set("tab", "logbook");
  if (params.page > 1) sp.set("page", String(params.page));
  if (params.pageSize !== 20) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("q", params.search);
  if (params.band) sp.set("band", params.band);
  if (params.mode) sp.set("mode", params.mode);
  if (params.status !== "all") sp.set("status", params.status);
  if (params.source) sp.set("source", params.source);
  if (params.sortKey !== "qsoAt") sp.set("sort", params.sortKey);
  const defaultDir = params.sortKey === "qsoAt" ? "desc" : "asc";
  if (params.sortDir !== defaultDir) sp.set("dir", params.sortDir);
  return `${hamPublicPath(callsign)}?${sp.toString()}`;
}

const QSO_EMAIL_LIMIT_WARNING_KEY = "qso-email-limit-warning";
const SEARCH_DEBOUNCE_MS = 300;

export function QsoLogbook({
  logbookUserId,
  stationCallsign,
  initialPage = null,
  canEdit = true,
  canLogWithOperator = false,
  canAdminManage = false,
}: Props) {
  const t = useTranslations("logbook");
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManageLogbook = canEdit || canAdminManage;
  const { ask, modal: confirmModal } = usePortalConfirm();
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<number | null>(null);
  const fetchSeqRef = useRef(0);

  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = parseQsoLogbookPageSize(
    searchParams.get("pageSize") ?? QSO_LOGBOOK_DEFAULT_PAGE_SIZE,
  );
  const search = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const bandFilter = parseQsoLogbookBandFilter(
    searchParams.get("band") ?? undefined,
  );
  const modeFilter = parseQsoLogbookModeFilter(
    searchParams.get("mode") ?? undefined,
  );
  const statusFilter = parseQsoLogbookStatusFilter(
    searchParams.get("status") ?? undefined,
  );
  const sourceFilter = parseQsoLogbookSourceFilter(
    searchParams.get("source") ?? undefined,
  );
  const sortKey = parseQsoLogbookSortKey(searchParams.get("sort") ?? undefined);
  const sortDir = parseQsoLogbookSortDir(
    searchParams.get("dir") ?? undefined,
    sortKey,
  );
  const filtersActive = hasQsoLogbookFilters({
    search,
    band: bandFilter,
    mode: modeFilter,
    status: statusFilter,
    source: sourceFilter,
  });

  const [pageData, setPageData] = useState<QsoLogbookPageResult | null>(
    initialPage,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(!initialPage);
  const [searchInput, setSearchInput] = useState(search);
  const [searchUrlSnapshot, setSearchUrlSnapshot] = useState(search);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importError, setImportError] = useState<AdifImportErrorRef | null>(
    null,
  );
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importRecordErrors, setImportRecordErrors] = useState<
    AdifImportRecordError[]
  >([]);
  const [importRecordErrorsTruncated, setImportRecordErrorsTruncated] =
    useState(0);
  const [failedImportFiles, setFailedImportFiles] = useState<
    { name: string; reason: AdifImportErrorRef }[]
  >([]);
  const [isImporting, startImportTransition] = useTransition();
  const [isNavigating, startNavigateTransition] = useTransition();
  const pending = isSubmitting || isDeleting || isImporting || isNavigating;

  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const totalPages =
    pageData?.totalPages ??
    (total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize)));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  if (search !== searchUrlSnapshot) {
    setSearchUrlSnapshot(search);
    setSearchInput(search);
  }

  useEffect(() => {
    const seq = ++fetchSeqRef.current;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setListLoading(true);
      setListError(null);
      void loadQsoLogbookPageAction({
        userId: logbookUserId,
        page,
        pageSize,
        search,
        band: bandFilter,
        mode: modeFilter,
        status: statusFilter,
        source: sourceFilter,
        sortKey,
        sortDir,
      }).then((result) => {
        if (cancelled || seq !== fetchSeqRef.current) return;
        if (!result.ok) {
          setListError(result.error);
          setPageData(null);
          setListLoading(false);
          return;
        }
        setPageData(result.page);
        setListLoading(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    logbookUserId,
    page,
    pageSize,
    search,
    bandFilter,
    modeFilter,
    statusFilter,
    sourceFilter,
    sortKey,
    sortDir,
  ]);

  async function reloadList(overrides?: { page?: number }) {
    const seq = ++fetchSeqRef.current;
    const nextPage = overrides?.page ?? page;
    setListLoading(true);
    setListError(null);
    const result = await loadQsoLogbookPageAction({
      userId: logbookUserId,
      page: nextPage,
      pageSize,
      search,
      band: bandFilter,
      mode: modeFilter,
      status: statusFilter,
      source: sourceFilter,
      sortKey,
      sortDir,
    });
    if (seq !== fetchSeqRef.current) return;
    if (!result.ok) {
      setListError(result.error);
      setPageData(null);
      setListLoading(false);
      return;
    }
    setPageData(result.page);
    setListLoading(false);
  }
  function navigateLogbook(
    updates: Partial<{
      page: number;
      pageSize: number;
      search: string;
      band: string;
      mode: string;
      status: QsoLogbookStatusFilter;
      source: string;
      sortKey: SortKey;
      sortDir: SortDir;
    }>,
  ) {
    const href = buildLogbookHref(stationCallsign, {
      page: updates.page ?? page,
      pageSize: updates.pageSize ?? pageSize,
      search: updates.search ?? search,
      band: updates.band ?? bandFilter,
      mode: updates.mode ?? modeFilter,
      status: updates.status ?? statusFilter,
      source: updates.source ?? sourceFilter,
      sortKey: updates.sortKey ?? sortKey,
      sortDir: updates.sortDir ?? sortDir,
    });
    startNavigateTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef.current != null) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed === search) return;
      navigateLogbook({ search: trimmed, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
  }

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

  useSharedHomeGridAutofill(
    form.workedCallsign,
    (grid) => {
      clearFieldErrors("grid");
      setForm((prev) => ({ ...prev, grid }));
    },
    !editingId,
  );

  function applyModeBandFreq(next: {
    mode?: QsoMode;
    band?: QsoInputValues["band"];
  }) {
    const mode = next.mode ?? form.mode;
    const band = next.band ?? form.band;
    const suggested = suggestedFreqMhzForModeBand(mode, band);
    if (!suggested) {
      setForm((prev) => ({ ...prev, ...next }));
      return;
    }
    clearFieldErrors("freqMhz");
    setForm((prev) => ({ ...prev, ...next, freqMhz: suggested }));
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
    if (sortKey === key) {
      navigateLogbook({
        sortKey: key,
        sortDir: sortDir === "asc" ? "desc" : "asc",
        page: 1,
      });
      return;
    }
    navigateLogbook({
      sortKey: key,
      sortDir: key === "qsoAt" ? "desc" : "asc",
      page: 1,
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const nextFieldErrors = mandatoryFieldErrors(form, timeZoneMode);
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(t("formFields"));
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
      workedName: form.workedName,
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
        if (!editingId && !canEdit) {
          setSuccessMessage(
            t("qsoLoggedWithOperator", { callsign: stationCallsign }),
          );
        }
        resetModal();
        void reloadList();
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
      const result = canAdminManage
        ? await adminDeleteQsoAction(id, logbookUserId)
        : await deleteQsoAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      void reloadList();
    } finally {
      setIsDeleting(false);
    }
  }

  async function onDeleteAll() {
    if (!canEdit && !canAdminManage) return;
    const confirmed = await ask({
      title: t("deleteAll"),
      message: t("confirmDeleteAll", { callsign: stationCallsign }),
      confirmLabel: t("deleteAll"),
      cancelLabel: t("cancel"),
      variant: "danger",
    });
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    try {
      const result = await deleteAllUserQsosAction(logbookUserId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setImportSummary(null);
      setImportRecordErrors([]);
      setImportRecordErrorsTruncated(0);
      setFailedImportFiles([]);
      setSuccessMessage(t("deletedAll", { count: result.deleted }));
      navigateLogbook({ page: 1, search: "" });
      void reloadList();
    } finally {
      setIsDeleting(false);
    }
  }

  function onImportAdifSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setImportError(null);
    setImportSummary(null);
    setImportRecordErrors([]);
    setImportRecordErrorsTruncated(0);
    setFailedImportFiles([]);
    setSuccessMessage(null);

    startImportTransition(async () => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      const result = await importQsoAdifAction(formData);
      const failedFiles =
        "failedFiles" in result && Array.isArray(result.failedFiles)
          ? result.failedFiles
          : [];
      const recordErrors =
        "recordErrors" in result && Array.isArray(result.recordErrors)
          ? result.recordErrors
          : [];
      const truncatedRecordErrors =
        "truncatedRecordErrors" in result &&
        typeof result.truncatedRecordErrors === "number"
          ? result.truncatedRecordErrors
          : 0;
      setFailedImportFiles(failedFiles);
      setImportRecordErrors(recordErrors);
      setImportRecordErrorsTruncated(truncatedRecordErrors);

      if (!result.ok) {
        setImportError(result.error);
        return;
      }

      setImportSummary(
        t("importSuccess", {
          imported: result.imported,
          updated: result.updated,
          unchanged: result.unchanged,
          skippedInvalid: result.skippedInvalid,
          skippedStationMismatch: result.skippedStationMismatch,
        }),
      );

      // Reload page 1 first so the table shows fresh import data even when the
      // URL is already on page 1 (navigate alone would not re-trigger fetch).
      await reloadList({ page: 1 });
      navigateLogbook({ page: 1 });
      router.refresh();
    });
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
              applyModeBandFreq({
                band: e.target.value as QsoInputValues["band"],
              })
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
              applyModeBandFreq({
                mode: e.target.value as QsoMode,
              })
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
            className={btnPrimaryClass}
          >
            {pending ? t("saving") : editingId ? t("update") : t("add")}
          </button>
          <button
            type="button"
            onClick={closeModal}
            disabled={pending}
            className={btnSecondaryClass}
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-6">
      {canEdit || canAdminManage || canLogWithOperator ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={openCreateModal}
                aria-label={t("addQso")}
                title={t("addQso")}
                className={btnPrimaryClass}
              >
                <PlusIcon />
                <span className={btnLabelClass}>{t("addQso")}</span>
              </button>
              {/* API download — not a Next.js page route */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/account/qso/export"
                aria-label={t("exportAdif")}
                title={t("exportAdif")}
                className={btnSecondaryClass}
              >
                <DownloadIcon />
                <span className={btnLabelClass}>{t("exportAdif")}</span>
              </a>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => importInputRef.current?.click()}
                aria-label={isImporting ? t("importing") : t("importAdif")}
                title={isImporting ? t("importing") : t("importAdif")}
                className={btnSecondaryClass}
              >
                <UploadIcon />
                <span className={btnLabelClass}>
                  {isImporting ? t("importing") : t("importAdif")}
                </span>
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".adi,.adif,text/plain"
                multiple
                className="sr-only"
                onChange={onImportAdifSelected}
              />
            </>
          ) : null}
          {canLogWithOperator ? (
            <button
              type="button"
              onClick={openLogWithOperatorModal}
              aria-label={t("logQsoWithOperator")}
              title={t("logQsoWithOperator")}
              className={btnPrimaryClass}
            >
              <PlusIcon />
              <span className={btnLabelClass}>{t("logQsoWithOperator")}</span>
            </button>
          ) : null}
          {(canEdit || canAdminManage) && total > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void onDeleteAll()}
              aria-label={pending ? t("deletingAll") : t("deleteAll")}
              title={pending ? t("deletingAll") : t("deleteAll")}
              className={btnDangerClass}
            >
              <DeleteIcon />
              <span className={btnLabelClass}>
                {pending ? t("deletingAll") : t("deleteAll")}
              </span>
            </button>
          ) : null}
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
      {importSummary ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {importSummary}
        </p>
      ) : null}
      {importError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {translateAdifImportError(t, importError)}
        </p>
      ) : null}
      {importRecordErrors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">{t("importRecordErrors")}</p>
          <ul className="mt-2 max-h-64 list-disc space-y-1 overflow-y-auto pl-5">
            {importRecordErrors.map((item) => (
              <li
                key={`${item.fileName}:${item.recordLine}:${item.reason.key}`}
              >
                <span className="font-medium">{item.fileName}</span>
                {" · "}
                {t("importRecordLine", { line: item.recordLine })}
                {": "}
                {translateAdifImportError(t, item.reason)}
              </li>
            ))}
          </ul>
          {importRecordErrorsTruncated > 0 ? (
            <p className="mt-2 text-red-700">
              {t("importRecordErrorsTruncated", {
                count: importRecordErrorsTruncated,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      {failedImportFiles.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{t("importFailedFiles")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {failedImportFiles.map((file) => (
              <li key={`${file.name}:${file.reason.key}`}>
                <span className="font-medium">{file.name}</span>:{" "}
                {translateAdifImportError(t, file.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {listError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="max-w-md text-sm text-red-700">{listError}</p>
          <button
            type="button"
            onClick={() => void reloadList()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            {t("retry")}
          </button>
        </div>
      ) : listLoading && !pageData ? (
        <div
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-sm text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-muted border-t-accent"
            aria-hidden
          />
          {t("loading")}
        </div>
      ) : total === 0 && !filtersActive ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="max-w-md text-muted">
            {t("emptyFor", { callsign: stationCallsign })}
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreateModal}
              className={`mt-6 ${btnPrimaryClass}`}
            >
              <PlusIcon />
              {t("addQso")}
            </button>
          ) : canLogWithOperator ? (
            <button
              type="button"
              onClick={openLogWithOperatorModal}
              className={`mt-6 ${btnPrimaryClass}`}
            >
              <PlusIcon />
              {t("logQsoWithOperator")}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="block text-sm sm:col-span-2 lg:col-span-2">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {t("filterSearch")}
                </span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {t("band")}
                </span>
                <select
                  value={bandFilter}
                  onChange={(e) =>
                    navigateLogbook({ band: e.target.value, page: 1 })
                  }
                  className={filterSelectClass}
                >
                  <option value="">{t("filterAll")}</option>
                  {QSO_BANDS.map((band) => (
                    <option key={band} value={band}>
                      {band}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {t("mode")}
                </span>
                <select
                  value={modeFilter}
                  onChange={(e) =>
                    navigateLogbook({ mode: e.target.value, page: 1 })
                  }
                  className={filterSelectClass}
                >
                  <option value="">{t("filterAll")}</option>
                  {QSO_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {t("status")}
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    navigateLogbook({
                      status: e.target.value as QsoLogbookStatusFilter,
                      page: 1,
                    })
                  }
                  className={filterSelectClass}
                >
                  <option value="all">{t("filterAll")}</option>
                  <option value="confirmed">{t("filterStatusConfirmed")}</option>
                  <option value="sent">{t("filterStatusSent")}</option>
                  <option value="pending">{t("filterStatusPending")}</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {t("filterSource")}
                </span>
                <select
                  value={sourceFilter}
                  onChange={(e) =>
                    navigateLogbook({ source: e.target.value, page: 1 })
                  }
                  className={filterSelectClass}
                >
                  <option value="">{t("filterAll")}</option>
                  {QSO_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {t(`source.${source}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {total > 0
                  ? t("showingRange", {
                      start: rangeStart,
                      end: rangeEnd,
                      total,
                    })
                  : t("resultCount", { count: 0 })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      if (searchTimerRef.current != null) {
                        window.clearTimeout(searchTimerRef.current);
                      }
                      navigateLogbook({
                        search: "",
                        band: "",
                        mode: "",
                        status: "all",
                        source: "",
                        page: 1,
                      });
                    }}
                    className={btnSecondaryClass}
                  >
                    {t("clearFilters")}
                  </button>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span>{t("rowsPerPage")}</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      navigateLogbook({
                        pageSize: Number(e.target.value) as typeof pageSize,
                        page: 1,
                      });
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    {QSO_LOGBOOK_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="relative grid gap-3 md:hidden">
            {listLoading ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70"
                role="status"
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted shadow-sm">
                  <span
                    className="inline-block size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground"
                    aria-hidden
                  />
                  {t("loading")}
                </span>
              </div>
            ) : null}
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
                {t("noSearchResults")}
              </p>
            ) : (
              items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {item.workedCallsign}
                      </p>
                      {item.workedName ? (
                        <p className="truncate text-xs text-muted">
                          {item.workedName}
                        </p>
                      ) : null}
                    </div>
                    {canManageLogbook ? (
                      <div className="flex shrink-0 gap-1">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            aria-label={t("edit")}
                            title={t("edit")}
                            className="rounded-md p-2 text-foreground hover:bg-foreground/5"
                          >
                            <EditIcon />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void onDelete(item.id)}
                          aria-label={t("delete")}
                          title={t("delete")}
                          className="rounded-md p-2 text-foreground hover:bg-foreground/5 disabled:opacity-50"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted">{t("dateTime")}</dt>
                      <dd className="mt-0.5 font-medium">
                        {formatQsoDateTime(item.qsoAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("band")}</dt>
                      <dd className="mt-0.5 font-medium">
                        {item.band} · {item.mode}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("grid")}</dt>
                      <dd className="mt-0.5 font-mono font-medium uppercase">
                        {item.grid || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("rst")}</dt>
                      <dd className="mt-0.5 font-medium">
                        {item.rstSent}/{item.rstRcvd}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted">{t("status")}</dt>
                      <dd className="mt-1">
                        {item.qso_confirmed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-1 text-xs font-medium">
                            <CheckIcon />
                            {t("qsoConfirmed")}
                          </span>
                        ) : item.qso_sent ? (
                          <span className="rounded-full bg-foreground/8 px-2 py-1 text-xs font-medium">
                            {t("qsoSent")}
                          </span>
                        ) : (
                          <span className="text-muted">{t("statusPending")}</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="relative hidden overflow-x-auto rounded-lg border border-border md:block">
            {listLoading ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/70"
                role="status"
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted shadow-sm">
                  <span
                    className="inline-block size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground"
                    aria-hidden
                  />
                  {t("loading")}
                </span>
              </div>
            ) : null}
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
                  {canManageLogbook ? (
                    <th className="px-3 py-2 font-medium">{t("actions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageLogbook ? 8 : 7}
                      className="px-3 py-8 text-center text-muted"
                    >
                      {t("noSearchResults")}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-border/70">
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex min-w-0 flex-col">
                            <span>{item.workedCallsign}</span>
                            {item.workedName ? (
                              <span className="truncate text-xs font-normal text-muted">
                                {item.workedName}
                              </span>
                            ) : null}
                          </span>
                          {item.qso_confirmed ? (
                            <span
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground"
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
                      <td className="px-3 py-2 font-mono uppercase">
                        {item.grid}
                      </td>
                      <td className="px-3 py-2">
                        {item.rstSent}/{item.rstRcvd}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {item.qso_confirmed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-1 text-xs font-medium">
                              <CheckIcon />
                              {t("qsoConfirmed")}
                            </span>
                          ) : item.qso_sent ? (
                            <span className="rounded-full bg-foreground/8 px-2 py-1 text-xs font-medium text-foreground">
                              {t("qsoSent")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">
                              {t("statusPending")}
                            </span>
                          )}
                        </div>
                      </td>
                      {canManageLogbook ? (
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                aria-label={t("edit")}
                                title={t("edit")}
                                className="rounded-md p-2 text-foreground hover:bg-foreground/5"
                              >
                                <EditIcon />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void onDelete(item.id)}
                              aria-label={t("delete")}
                              title={t("delete")}
                              className="rounded-md p-2 text-foreground hover:bg-foreground/5 disabled:opacity-50"
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
                onClick={() => navigateLogbook({ page: page - 1 })}
                disabled={page <= 1 || totalPages === 0}
                className={`${btnSecondaryClass} disabled:pointer-events-none disabled:opacity-40`}
              >
                {t("previous")}
              </button>
              <span className="text-muted">
                {t("pageOf", { page, totalPages: Math.max(totalPages, 1) })}
              </span>
              <button
                type="button"
                onClick={() => navigateLogbook({ page: page + 1 })}
                disabled={totalPages === 0 || page >= totalPages}
                className={`${btnSecondaryClass} disabled:pointer-events-none disabled:opacity-40`}
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
