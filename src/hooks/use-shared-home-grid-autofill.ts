"use client";

import { useEffect, useRef } from "react";
import { lookupSharedHomeGridAction } from "@/lib/qso-actions";
import {
  isValidCallsign,
  normalizeProfileCallsign,
} from "@/lib/validations/qso";

const LOOKUP_DEBOUNCE_MS = 400;

/**
 * When `callsign` looks valid, look up a publicly shared home grid and call
 * `onGrid` (once per resolved callsign).
 */
export function useSharedHomeGridAutofill(
  callsign: string,
  onGrid: (grid: string) => void,
  enabled = true,
) {
  const onGridRef = useRef(onGrid);
  const lastFilledForRef = useRef("");

  useEffect(() => {
    onGridRef.current = onGrid;
  }, [onGrid]);

  useEffect(() => {
    if (!enabled) {
      lastFilledForRef.current = "";
      return;
    }

    const normalized = normalizeProfileCallsign(callsign);
    if (!isValidCallsign(normalized)) {
      lastFilledForRef.current = "";
      return;
    }
    if (lastFilledForRef.current === normalized) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await lookupSharedHomeGridAction(normalized);
        if (cancelled || !result.ok || !result.grid) return;
        lastFilledForRef.current = normalized;
        onGridRef.current(result.grid);
      })();
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [callsign, enabled]);
}
