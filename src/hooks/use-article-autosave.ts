"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { autoSaveArticleAction } from "@/lib/actions";
import {
  hasMinimalArticleContent,
  type ArticleFormValues,
} from "@/lib/validations/article";

const AUTOSAVE_DEBOUNCE_MS = 2500;

export type ArticleAutosaveState = "idle" | "saving" | "saved" | "error";

function serializeArticleForm(form: ArticleFormValues): string {
  return JSON.stringify(form);
}

type Options = {
  initialArticleId?: string;
  form: ArticleFormValues;
  initialForm: ArticleFormValues;
};

export function useArticleAutosave({
  initialArticleId,
  form,
  initialForm,
}: Options) {
  const router = useRouter();
  const [articleId, setArticleId] = useState(initialArticleId);
  const [saveState, setSaveState] = useState<ArticleAutosaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    serializeArticleForm(initialForm),
  );

  const formRef = useRef(form);
  const lastSavedSnapshotRef = useRef(lastSavedSnapshot);
  const savingRef = useRef(false);
  const pendingAfterSaveRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const articleIdRef = useRef(articleId);
  const runSaveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    lastSavedSnapshotRef.current = lastSavedSnapshot;
  }, [lastSavedSnapshot]);

  useEffect(() => {
    articleIdRef.current = articleId;
  }, [articleId]);

  const formSnapshot = serializeArticleForm(form);
  const isDirty = formSnapshot !== lastSavedSnapshot;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const syncSavedSnapshot = useCallback((nextForm: ArticleFormValues) => {
    const snapshot = serializeArticleForm(nextForm);
    lastSavedSnapshotRef.current = snapshot;
    setLastSavedSnapshot(snapshot);
    setSaveState("saved");
    setSaveError(null);
  }, []);

  const runSave = useCallback(async () => {
    if (savingRef.current) {
      pendingAfterSaveRef.current = true;
      return;
    }

    const currentForm = formRef.current;
    const snapshot = serializeArticleForm(currentForm);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    const currentId = articleIdRef.current ?? null;
    if (!currentId && !hasMinimalArticleContent(currentForm)) {
      return;
    }

    savingRef.current = true;
    pendingAfterSaveRef.current = false;
    setSaveState("saving");
    setSaveError(null);

    const result = await autoSaveArticleAction(currentId, currentForm);

    if (!mountedRef.current) return;

    savingRef.current = false;

    if (!result.ok) {
      if (result.error === "Nothing to save yet") {
        setSaveState("idle");
        return;
      }
      setSaveState("error");
      setSaveError(result.error);
      return;
    }

    const wasCreate = !currentId;
    setArticleId(result.id);
    articleIdRef.current = result.id;
    lastSavedSnapshotRef.current = snapshot;
    setLastSavedSnapshot(snapshot);
    setLastSavedAt(new Date(result.savedAt));
    setSaveState("saved");
    setSaveError(null);

    if (wasCreate) {
      router.replace(`/admin/articles/${result.id}`, { scroll: false });
    }

    if (pendingAfterSaveRef.current) {
      pendingAfterSaveRef.current = false;
      const latestSnapshot = serializeArticleForm(formRef.current);
      if (latestSnapshot !== snapshot) {
        void runSaveRef.current();
      }
    }
  }, [router]);

  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  const flushSave = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void runSaveRef.current();
  }, []);

  useEffect(() => {
    if (!isDirty) return;

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void runSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [formSnapshot, isDirty]);

  useEffect(() => {
    if (!isDirty && saveState !== "saving") return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty, saveState]);

  return {
    articleId,
    saveState,
    lastSavedAt,
    saveError,
    isDirty,
    flushSave,
    syncSavedSnapshot,
  };
}
