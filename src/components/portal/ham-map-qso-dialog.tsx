"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import { createQsoAction } from "@/lib/qso-actions";
import {
  convertQsoDateTimeParts,
  fromQsoDateTimeParts,
  qsoDateTimeNow,
  type QsoTimeZoneMode,
} from "@/lib/qso-datetime";
import {
  QSO_BANDS,
  QSO_MODES,
  isValidFreqMhzInput,
  normalizeFreqMhzInput,
  type QsoInputValues,
  type QsoMode,
} from "@/lib/validations/qso";

type Props = {
  open: boolean;
  mapTheme: HamMapTheme;
  /** Grid to prefill — the operator usually logs the square they just picked. */
  defaultGrid?: string;
  onClose: () => void;
};

type FormState = {
  workedCallsign: string;
  qsoDate: string;
  qsoTime: string;
  band: QsoInputValues["band"];
  freqMhz: string;
  mode: QsoMode;
  rstSent: string;
  rstRcvd: string;
  grid: string;
  notes: string;
};

type FieldKey = "workedCallsign" | "qsoDate" | "qsoTime" | "freqMhz" | "grid";

function initialForm(grid: string): FormState {
  const { date, time } = qsoDateTimeNow("utc");
  return {
    workedCallsign: "",
    qsoDate: date,
    qsoTime: time,
    band: "20m",
    freqMhz: "",
    mode: "SSB",
    rstSent: "59",
    rstRcvd: "59",
    grid: grid.trim().toUpperCase(),
    notes: "",
  };
}

function missingFields(
  form: FormState,
  zone: QsoTimeZoneMode,
): Partial<Record<FieldKey, boolean>> {
  const errors: Partial<Record<FieldKey, boolean>> = {};
  if (!form.workedCallsign.trim()) errors.workedCallsign = true;
  if (!form.qsoDate.trim()) errors.qsoDate = true;
  if (!form.qsoTime.trim()) errors.qsoTime = true;
  if (
    form.qsoDate.trim() &&
    form.qsoTime.trim() &&
    !fromQsoDateTimeParts(form.qsoDate, form.qsoTime, zone)
  ) {
    errors.qsoDate = true;
    errors.qsoTime = true;
  }
  if (!isValidFreqMhzInput(form.freqMhz)) errors.freqMhz = true;
  if (!form.grid.trim()) errors.grid = true;
  return errors;
}

/**
 * Logs a QSO without leaving the map. Mount it only while open so the draft
 * resets between openings.
 */
export function HamMapQsoDialog({
  open,
  mapTheme,
  defaultGrid = "",
  onClose,
}: Props) {
  const t = useTranslations("logbook");
  const mapT = useTranslations("ham.map");
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialForm(defaultGrid));
  const [zone, setZone] = useState<QsoTimeZoneMode>("utc");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, boolean>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const light = mapTheme === "light";

  function clearError(...fields: FieldKey[]) {
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }

  function switchZone(next: QsoTimeZoneMode) {
    if (next === zone) return;
    const converted = convertQsoDateTimeParts(
      form.qsoDate,
      form.qsoTime,
      zone,
      next,
    );
    if (converted) {
      setForm((prev) => ({
        ...prev,
        qsoDate: converted.date,
        qsoTime: converted.time,
      }));
    }
    setZone(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = missingFields(form, zone);
    if (Object.keys(invalid).length > 0) {
      setFieldErrors(invalid);
      setError(mapT("qsoFormRequired"));
      return;
    }

    const qsoAt = fromQsoDateTimeParts(form.qsoDate, form.qsoTime, zone);
    if (!qsoAt) {
      setFieldErrors({ qsoDate: true, qsoTime: true });
      setError(t("invalidDateTime"));
      return;
    }

    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      const result = await createQsoAction({
        workedCallsign: form.workedCallsign,
        qsoAt,
        band: form.band,
        freqMhz: Number(form.freqMhz.trim()),
        mode: form.mode,
        rstSent: form.rstSent,
        rstRcvd: form.rstRcvd,
        qso_sent: true,
        grid: form.grid,
        notes: form.notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The map and the sidebar both read server-rendered QSOs.
      router.refresh();
      onClose();
    });
  }

  const panelClass = light
    ? "border-zinc-300/80 bg-white/95 text-zinc-900 shadow-xl shadow-zinc-900/15"
    : "border-white/10 bg-zinc-950/95 text-white shadow-2xl shadow-black/50";
  const titleClass = light ? "text-zinc-900" : "text-white";
  const closeClass = light
    ? "text-zinc-500 hover:bg-zinc-100"
    : "text-white/60 hover:bg-white/10";
  const labelClass = light ? "text-zinc-500" : "text-white/55";
  const fieldBase = light
    ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
    : "border-white/15 bg-white/5 text-white placeholder:text-white/35";
  const invalidBase = light
    ? "border-red-400 bg-white text-zinc-900"
    : "border-red-400/70 bg-white/5 text-white";
  const cancelClass = light
    ? "border-zinc-300 text-zinc-800 hover:bg-zinc-100"
    : "border-white/20 text-white hover:bg-white/10";
  const saveClass = light
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "bg-white text-zinc-950 hover:bg-white/90";
  const errorClass = light
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-red-400/30 bg-red-500/15 text-red-100";
  const overlayClass = light ? "bg-zinc-900/35" : "bg-black/60";
  const switchClass = light
    ? "text-zinc-600 hover:text-zinc-900"
    : "text-white/60 hover:text-white";

  function fieldClass(field: FieldKey, extra = "") {
    return `mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${extra} ${
      fieldErrors[field] ? invalidBase : fieldBase
    }`;
  }

  const label = `text-xs font-medium tracking-wide uppercase ${labelClass}`;

  return (
    <PortalDialog
      open={open}
      animated
      title={t("addQso")}
      onClose={onClose}
      closeDisabled={pending}
      size="lg"
      overlayClassName={overlayClass}
      zIndex={120}
      panelClassName={panelClass}
      titleClassName={titleClass}
      closeClassName={closeClass}
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={label}>{t("workedCallsign")}</span>
          <input
            value={form.workedCallsign}
            autoFocus
            maxLength={15}
            disabled={pending}
            onChange={(event) => {
              clearError("workedCallsign");
              setForm((prev) => ({
                ...prev,
                workedCallsign: event.target.value.toUpperCase(),
              }));
            }}
            className={fieldClass("workedCallsign", "uppercase")}
          />
        </label>

        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <span className={label}>
              {t("dateTime")}{" "}
              {zone === "utc" ? t("timeZoneUtc") : t("timeZoneLocal")}
            </span>
            <button
              type="button"
              onClick={() => switchZone(zone === "utc" ? "local" : "utc")}
              className={`shrink-0 text-xs transition ${switchClass}`}
            >
              {zone === "utc" ? t("switchToLocalTime") : t("switchToUtc")}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <input
                type="date"
                value={form.qsoDate}
                disabled={pending}
                aria-label={t("date")}
                onChange={(event) => {
                  clearError("qsoDate", "qsoTime");
                  setForm((prev) => ({ ...prev, qsoDate: event.target.value }));
                }}
                className={fieldClass("qsoDate")}
              />
            </label>
            <label className="block">
              <input
                type="time"
                step={1}
                value={form.qsoTime}
                disabled={pending}
                aria-label={t("time")}
                onChange={(event) => {
                  clearError("qsoDate", "qsoTime");
                  setForm((prev) => ({ ...prev, qsoTime: event.target.value }));
                }}
                className={fieldClass("qsoTime")}
              />
            </label>
          </div>
        </div>

        <label className="block">
          <span className={label}>{t("band")}</span>
          <select
            value={form.band}
            disabled={pending}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                band: event.target.value as QsoInputValues["band"],
              }))
            }
            className={`mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldBase}`}
          >
            {QSO_BANDS.map((band) => (
              <option key={band} value={band} className="text-zinc-900">
                {band}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={label}>{t("freqMhz")}</span>
          <input
            inputMode="decimal"
            value={form.freqMhz}
            disabled={pending}
            onChange={(event) => {
              clearError("freqMhz");
              setForm((prev) => ({
                ...prev,
                freqMhz: normalizeFreqMhzInput(event.target.value),
              }));
            }}
            className={fieldClass("freqMhz")}
          />
        </label>

        <label className="block">
          <span className={label}>{t("mode")}</span>
          <select
            value={form.mode}
            disabled={pending}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                mode: event.target.value as QsoMode,
              }))
            }
            className={`mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldBase}`}
          >
            {QSO_MODES.map((mode) => (
              <option key={mode} value={mode} className="text-zinc-900">
                {mode}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={label}>{t("grid")}</span>
          <input
            value={form.grid}
            maxLength={12}
            disabled={pending}
            placeholder={t("gridPlaceholder")}
            onChange={(event) => {
              clearError("grid");
              setForm((prev) => ({
                ...prev,
                grid: event.target.value.toUpperCase(),
              }));
            }}
            className={fieldClass("grid", "uppercase")}
          />
        </label>

        <label className="block">
          <span className={label}>{t("rstSent")}</span>
          <input
            value={form.rstSent}
            maxLength={16}
            disabled={pending}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, rstSent: event.target.value }))
            }
            className={`mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldBase}`}
          />
        </label>

        <label className="block">
          <span className={label}>{t("rstRcvd")}</span>
          <input
            value={form.rstRcvd}
            maxLength={16}
            disabled={pending}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, rstRcvd: event.target.value }))
            }
            className={`mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldBase}`}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className={label}>{t("notes")}</span>
          <textarea
            rows={2}
            value={form.notes}
            maxLength={2000}
            disabled={pending}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notes: event.target.value }))
            }
            className={`mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldBase}`}
          />
        </label>

        {error ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm sm:col-span-2 ${errorClass}`}
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className={`rounded-md border px-4 py-2 text-sm transition disabled:opacity-50 ${cancelClass}`}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${saveClass}`}
          >
            {pending ? t("saving") : t("add")}
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}
