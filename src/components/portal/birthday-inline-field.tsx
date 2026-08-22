"use client";

import { useRef, useState } from "react";
import {
  formatBirthdayDmy,
  maxBirthdayYear,
  parseBirthdayInput,
} from "@/lib/validations/qso";

type Props = {
  value: string;
  disabled?: boolean;
  pickDateLabel: string;
  onCommit: (iso: string) => void;
  onInvalid?: () => void;
};

const inputClass =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm";

export function BirthdayInlineField({
  value,
  disabled = false,
  pickDateLabel,
  onCommit,
  onInvalid,
}: Props) {
  const [textValue, setTextValue] = useState(() => formatBirthdayDmy(value));
  const dateInputRef = useRef<HTMLInputElement>(null);

  function commitFromText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (value) onCommit("");
      return;
    }
    const parsed = parseBirthdayInput(trimmed);
    if (parsed === null) {
      onInvalid?.();
      setTextValue(formatBirthdayDmy(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  }

  function commitFromIso(iso: string) {
    setTextValue(formatBirthdayDmy(iso));
    if (iso !== value) onCommit(iso);
  }

  function openDatePicker() {
    if (disabled) return;
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  const pickerValue =
    parseBirthdayInput(textValue) ?? (value && parseBirthdayInput(value) ? value : "");

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={textValue}
        disabled={disabled}
        onChange={(event) => setTextValue(event.target.value)}
        onBlur={() => commitFromText(textValue)}
        className={inputClass}
      />
      <button
        type="button"
        onClick={openDatePicker}
        disabled={disabled}
        aria-label={pickDateLabel}
        className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-60"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5 2v2M11 2v2" />
        </svg>
      </button>
      <input
        ref={dateInputRef}
        type="date"
        lang="en-GB"
        value={pickerValue}
        min="1900-01-01"
        max={`${maxBirthdayYear()}-12-31`}
        disabled={disabled}
        onChange={(event) => commitFromIso(event.target.value)}
        aria-label={pickDateLabel}
        tabIndex={-1}
        className="sr-only"
      />
    </div>
  );
}
