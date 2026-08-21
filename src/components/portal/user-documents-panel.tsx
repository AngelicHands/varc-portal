"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { UserDocumentDto } from "@/lib/account-types";
import type { UserDocumentKind } from "@/lib/validations/qso";

type DocumentLabels = {
  certificate: string;
  license: string;
  upload: string;
  uploading: string;
  uploadFailed: string;
  delete: string;
  deleteFailed: string;
  noDocuments: string;
};

const DEFAULT_LABELS: DocumentLabels = {
  certificate: "Certificate",
  license: "License",
  upload: "Upload file",
  uploading: "Uploading…",
  uploadFailed: "Upload failed",
  delete: "Delete",
  deleteFailed: "Delete failed",
  noDocuments: "No files uploaded yet.",
};

type Props = {
  initialDocuments: UserDocumentDto[];
  uploadEndpoint: string;
  canDelete?: boolean;
  labels?: Partial<DocumentLabels>;
  tone?: "portal" | "admin";
  /** `panels` = dashed dropzones (documents tab). `list` = compact sections. */
  variant?: "list" | "panels";
  onDocumentsChange?: (documents: UserDocumentDto[]) => void;
};

type PendingPreview = {
  kind: UserDocumentKind;
  url: string;
  contentType: string;
  originalName: string;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function isPdfType(contentType: string): boolean {
  return contentType === "application/pdf";
}

function previewUrl(downloadUrl: string): string {
  return `${downloadUrl}?inline=1`;
}

function DocumentThumbnail({
  contentType,
  src,
  alt,
  href,
}: {
  contentType: string;
  src: string;
  alt: string;
  href?: string;
}) {
  const frame = (
    <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-foreground/5">
      {isImageType(contentType) ? (
        // eslint-disable-next-line @next/next/no-img-element -- private authenticated document preview
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : isPdfType(contentType) ? (
        <>
          <iframe
            src={`${src}#toolbar=0&navpanes=0`}
            title={alt}
            className="pointer-events-none h-[140%] w-[140%] max-w-none origin-top-left scale-[0.72] bg-white"
          />
          <span className="absolute right-1 bottom-1 rounded bg-red-600 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-white uppercase">
            PDF
          </span>
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted">
          {alt}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 transition hover:opacity-90"
      >
        {frame}
      </a>
    );
  }

  return frame;
}

export function UserDocumentsPanel({
  initialDocuments,
  uploadEndpoint,
  canDelete = true,
  labels: labelsProp,
  tone = "portal",
  variant = "list",
  onDocumentsChange,
}: Props) {
  const t = { ...DEFAULT_LABELS, ...labelsProp };
  const cardClass =
    tone === "admin"
      ? "rounded-lg border border-gray-200 bg-white p-5"
      : "rounded-lg border border-border bg-surface p-4";
  const rowClass =
    tone === "admin"
      ? "flex items-start gap-3 rounded border border-gray-200 px-3 py-2 text-sm"
      : "flex items-start gap-3 rounded border border-border px-3 py-2 text-sm";
  const titleClass =
    tone === "admin"
      ? "font-medium text-gray-900"
      : "font-medium text-foreground";
  const mutedClass = tone === "admin" ? "text-sm text-gray-600" : "text-sm text-muted";
  const uploadBtnClass =
    tone === "admin"
      ? "inline-flex cursor-pointer items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
      : "inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-foreground/5";
  const [documents, setDocuments] = useState(initialDocuments);
  const [pendingKind, setPendingKind] = useState<UserDocumentKind | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  useEffect(() => {
    return () => {
      if (pendingPreview?.url) {
        URL.revokeObjectURL(pendingPreview.url);
      }
    };
  }, [pendingPreview]);

  const grouped = useMemo(() => {
    return {
      certificate: documents.filter((doc) => doc.kind === "certificate"),
      license: documents.filter((doc) => doc.kind === "license"),
    };
  }, [documents]);

  async function upload(kind: UserDocumentKind, file: File | null) {
    if (!file) return;
    setError(null);
    setPendingKind(kind);

    const objectUrl = URL.createObjectURL(file);
    setPendingPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return {
        kind,
        url: objectUrl,
        contentType: file.type,
        originalName: file.name,
      };
    });

    try {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("file", file);
      const response = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        document?: UserDocumentDto;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.document) {
        throw new Error(payload.error || t.uploadFailed);
      }
      const next = [payload.document, ...documents];
      setDocuments(next);
      onDocumentsChange?.(next);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : t.uploadFailed,
      );
    } finally {
      setPendingKind(null);
      setPendingPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
    }
  }

  function onDelete(id: string) {
    startDelete(async () => {
      setError(null);
      const response = await fetch(`/api/account/documents/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error || t.deleteFailed);
        return;
      }
      const next = documents.filter((doc) => doc.id !== id);
      setDocuments(next);
      onDocumentsChange?.(next);
    });
  }

  function UploadButton({
    kind,
    className,
  }: {
    kind: UserDocumentKind;
    className: string;
  }) {
    return (
      <label className={className}>
        <input
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={pendingKind === kind}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void upload(kind, file);
            event.target.value = "";
          }}
        />
        {pendingKind === kind ? t.uploading : t.upload}
      </label>
    );
  }

  function DocumentRows({ kind }: { kind: UserDocumentKind }) {
    const items = grouped[kind];
    const showPending = pendingPreview?.kind === kind;
    if (items.length === 0 && !showPending) return null;

    return (
      <ul className="mt-3 w-full space-y-2">
        {showPending && pendingPreview ? (
          <li key="pending-upload" className={`${rowClass} opacity-80`}>
            <DocumentThumbnail
              contentType={pendingPreview.contentType}
              src={pendingPreview.url}
              alt={pendingPreview.originalName}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {pendingPreview.originalName}
              </p>
              <p
                className={`text-xs ${tone === "admin" ? "text-gray-500" : "text-muted"}`}
              >
                {t.uploading}
              </p>
            </div>
          </li>
        ) : null}
        {items.map((doc) => (
          <li key={doc.id} className={rowClass}>
            <DocumentThumbnail
              contentType={doc.contentType}
              src={previewUrl(doc.downloadUrl)}
              alt={doc.originalName}
              href={doc.downloadUrl}
            />
            <div className="min-w-0 flex-1 text-left">
              <a
                href={doc.downloadUrl}
                className="truncate font-medium text-accent hover:underline"
              >
                {doc.originalName}
              </a>
              <p className="text-xs text-muted">
                {formatBytes(doc.size)} ·{" "}
                {new Date(doc.createdAt).toLocaleString()}
              </p>
            </div>
            {canDelete ? (
              <button
                type="button"
                disabled={pendingDelete}
                onClick={() => onDelete(doc.id)}
                className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {t.delete}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  function renderListSection(kind: UserDocumentKind, title: string) {
    const items = grouped[kind];
    const showPending = pendingPreview?.kind === kind;

    return (
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className={titleClass}>{title}</h3>
          <UploadButton kind={kind} className={uploadBtnClass} />
        </div>
        {items.length === 0 && !showPending ? (
          <p className={`mt-3 ${mutedClass}`}>{t.noDocuments}</p>
        ) : (
          <DocumentRows kind={kind} />
        )}
      </section>
    );
  }

  function renderPanelSection(kind: UserDocumentKind, title: string) {
    const items = grouped[kind];
    const showPending = pendingPreview?.kind === kind;
    const isEmpty = items.length === 0 && !showPending;

    return (
      <section className="flex min-h-64 flex-col rounded-xl border border-dashed border-border bg-card/30 p-5 md:min-h-72">
        <h3 className="text-center text-sm font-medium tracking-wide text-foreground uppercase">
          {title}
        </h3>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 py-8">
            <p className="text-center text-sm text-muted">{t.noDocuments}</p>
            <UploadButton
              kind={kind}
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col">
            <DocumentRows kind={kind} />
            <div className="mt-auto flex justify-center pt-6">
              <UploadButton
                kind={kind}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
              />
            </div>
          </div>
        )}
      </section>
    );
  }

  const isPanels = variant === "panels";

  return (
    <div
      className={
        isPanels
          ? "grid gap-4 md:grid-cols-2"
          : tone === "admin"
            ? "grid gap-4 md:grid-cols-2"
            : "grid gap-4"
      }
    >
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
          {error}
        </p>
      ) : null}
      {isPanels
        ? renderPanelSection("certificate", t.certificate)
        : renderListSection("certificate", t.certificate)}
      {isPanels
        ? renderPanelSection("license", t.license)
        : renderListSection("license", t.license)}
    </div>
  );
}
