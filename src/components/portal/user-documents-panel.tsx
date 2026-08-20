"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { UserDocumentDto } from "@/lib/account-types";
import type { UserDocumentKind } from "@/lib/validations/qso";

type Props = {
  initialDocuments: UserDocumentDto[];
  uploadEndpoint: string;
  canDelete?: boolean;
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
}: Props) {
  const t = useTranslations("account");
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
        throw new Error(payload.error || t("uploadFailed"));
      }
      setDocuments((current) => [payload.document!, ...current]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : t("uploadFailed"),
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
        setError(payload.error || t("deleteFailed"));
        return;
      }
      setDocuments((current) => current.filter((doc) => doc.id !== id));
    });
  }

  function renderDocumentRow(doc: UserDocumentDto) {
    return (
      <li
        key={doc.id}
        className="flex items-start gap-3 rounded border border-border px-3 py-2 text-sm"
      >
        <DocumentThumbnail
          contentType={doc.contentType}
          src={previewUrl(doc.downloadUrl)}
          alt={doc.originalName}
          href={doc.downloadUrl}
        />
        <div className="min-w-0 flex-1">
          <a
            href={doc.downloadUrl}
            className="truncate font-medium text-accent hover:underline"
          >
            {doc.originalName}
          </a>
          <p className="text-xs text-muted">
            {formatBytes(doc.size)} · {new Date(doc.createdAt).toLocaleString()}
          </p>
        </div>
        {canDelete ? (
          <button
            type="button"
            disabled={pendingDelete}
            onClick={() => onDelete(doc.id)}
            className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            {t("delete")}
          </button>
        ) : null}
      </li>
    );
  }

  function renderPendingRow(preview: PendingPreview) {
    return (
      <li className="flex items-start gap-3 rounded border border-border px-3 py-2 text-sm opacity-80">
        <DocumentThumbnail
          contentType={preview.contentType}
          src={preview.url}
          alt={preview.originalName}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{preview.originalName}</p>
          <p className="text-xs text-muted">{t("uploading")}</p>
        </div>
      </li>
    );
  }

  function renderSection(kind: UserDocumentKind, title: string) {
    const items = grouped[kind];
    const showPending = pendingPreview?.kind === kind;

    return (
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-foreground">{title}</h3>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-foreground/5">
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
            {pendingKind === kind ? t("uploading") : t("upload")}
          </label>
        </div>
        {items.length === 0 && !showPending ? (
          <p className="mt-3 text-sm text-muted">{t("noDocuments")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {showPending && pendingPreview ? renderPendingRow(pendingPreview) : null}
            {items.map((doc) => renderDocumentRow(doc))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {renderSection("certificate", t("certificate"))}
      {renderSection("license", t("license"))}
    </div>
  );
}
