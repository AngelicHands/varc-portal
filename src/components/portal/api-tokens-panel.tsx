"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import {
  createApiTokenAction,
  listApiTokensAction,
  revokeApiTokenAction,
  type ApiTokenListItemDto,
} from "@/lib/api-token-actions";

const cardClass = "rounded-lg border border-border bg-surface p-4 md:p-5";
const fieldClass =
  "mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function CreateTokenDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const t = useTranslations("account");
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setExpiresAt("");
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createApiTokenAction({
        name,
        expiresAt: expiresAt.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      onCreated(result.token);
    });
  }

  return (
    <PortalDialog
      open={open}
      title={t("apiTokenCreateTitle")}
      onClose={handleClose}
      closeDisabled={pending}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm text-muted">{t("apiTokenCreateHelp")}</p>
        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("apiTokenNameLabel")}
          </span>
          <input
            type="text"
            required
            maxLength={120}
            value={name}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("apiTokenNamePlaceholder")}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("apiTokenExpiryLabel")}
          </span>
          <input
            type="datetime-local"
            value={expiresAt}
            disabled={pending}
            onChange={(event) => setExpiresAt(event.target.value)}
            className={fieldClass}
          />
        </label>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("apiTokenCreating") : t("apiTokenCreateAction")}
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}

function TokenCreatedDialog({
  open,
  token,
  onClose,
}: {
  open: boolean;
  token: string;
  onClose: () => void;
}) {
  const t = useTranslations("account");
  const [copied, setCopied] = useState(false);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PortalDialog
      open={open}
      title={t("apiTokenCreatedTitle")}
      onClose={onClose}
    >
      <div className="grid gap-4">
        <p className="text-sm text-amber-800">{t("apiTokenCreatedWarning")}</p>
        <code className="block break-all rounded-md border border-border bg-background px-3 py-2 text-xs">
          {token}
        </code>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={copyToken}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            {copied ? t("apiTokenCopied") : t("apiTokenCopy")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t("apiTokenDone")}
          </button>
        </div>
      </div>
    </PortalDialog>
  );
}

export function ApiTokensPanel() {
  const t = useTranslations("account");
  const [tokens, setTokens] = useState<ApiTokenListItemDto[]>([]);
  const [apiPublicUrl, setApiPublicUrl] = useState("http://localhost:3100");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reloadTokens() {
    const result = await listApiTokensAction();
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setTokens(result.tokens);
    setApiPublicUrl(result.apiPublicUrl);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listApiTokensAction();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setTokens(result.tokens);
      setApiPublicUrl(result.apiPublicUrl);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function revokeToken(id: string) {
    startTransition(async () => {
      const result = await revokeApiTokenAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLoading(true);
      await reloadTokens();
    });
  }

  return (
    <>
      <div className={`grid gap-4 ${cardClass}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t("apiTokenCardTitle")}</p>
            <p className="mt-1 text-muted">{t("apiTokenCardHelp")}</p>
            <p className="mt-2 text-xs text-muted">
              {t("apiTokenBaseUrl")}:{" "}
              <code className="rounded bg-background px-1 py-0.5">{apiPublicUrl}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={pending}
            className="shrink-0 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent disabled:opacity-60"
          >
            {t("apiTokenCreateAction")}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">{t("apiTokenLoading")}</p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {!loading && tokens.length === 0 ? (
          <p className="text-sm text-muted">{t("apiTokenEmpty")}</p>
        ) : null}

        {tokens.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{token.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {token.tokenPrefix}…
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t("apiTokenCreatedAt")}: {formatDate(token.createdAt)}
                    {" · "}
                    {t("apiTokenLastUsed")}: {formatDate(token.lastUsedAt)}
                    {token.expiresAt
                      ? ` · ${t("apiTokenExpires")}: ${formatDate(token.expiresAt)}`
                      : null}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => revokeToken(token.id)}
                  className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {t("apiTokenRevoke")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <CreateTokenDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(token) => {
          setCreateOpen(false);
          setCreatedToken(token);
          setLoading(true);
          void reloadTokens();
        }}
      />

      <TokenCreatedDialog
        open={createdToken != null}
        token={createdToken ?? ""}
        onClose={() => setCreatedToken(null)}
      />
    </>
  );
}
