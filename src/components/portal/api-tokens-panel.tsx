"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { CopyIcon } from "@/components/admin/admin-action-icons";
import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import {
  API_TOKEN_PERMISSION_ROWS,
  API_TOKEN_SCOPES,
  type ApiTokenScope,
} from "@/lib/api-token-scopes";
import {
  createApiTokenAction,
  listApiTokensAction,
  regenerateApiTokenAction,
  revokeApiTokenAction,
  updateApiTokenScopesAction,
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

function PermissionMatrix({
  availableScopes,
  scopes,
  pending,
  idPrefix,
  onToggle,
}: {
  availableScopes: ApiTokenScope[];
  scopes: ApiTokenScope[];
  pending: boolean;
  idPrefix: string;
  onToggle: (scope: ApiTokenScope) => void;
}) {
  const t = useTranslations("account");
  const allowed = new Set(availableScopes);

  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-muted">
        {t("apiTokenPermissionsLabel")}
      </legend>
      <p className="text-sm text-muted">{t("apiTokenPermissionsHelp")}</p>
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
          <span className="sr-only">{t("apiTokenPermissionsLabel")}</span>
          <span className="col-start-2 text-center">
            {t("apiTokenPermissionRead")}
          </span>
          <span className="text-center">{t("apiTokenPermissionWrite")}</span>
        </div>
        <div className="divide-y divide-border">
          {API_TOKEN_PERMISSION_ROWS.map((row) => {
            const readEnabled = allowed.has(row.read);
            const writeScope = row.write;
            const writeEnabled = writeScope != null && allowed.has(writeScope);
            const readId = `${idPrefix}-${row.key}-read`;
            const writeId = `${idPrefix}-${row.key}-write`;
            return (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t(row.labelKey)}
                  </p>
                </div>
                <div className="flex justify-center">
                  <AdminCheckbox
                    id={readId}
                    checked={readEnabled && scopes.includes(row.read)}
                    disabled={pending || !readEnabled}
                    aria-label={`${t(row.labelKey)} ${t("apiTokenPermissionRead")}`}
                    onChange={() => onToggle(row.read)}
                  />
                </div>
                <div className="flex justify-center">
                  <AdminCheckbox
                    id={writeId}
                    checked={
                      writeEnabled &&
                      writeScope != null &&
                      scopes.includes(writeScope)
                    }
                    disabled={pending || !writeEnabled}
                    aria-label={`${t(row.labelKey)} ${t("apiTokenPermissionWrite")}`}
                    onChange={() => {
                      if (writeScope) onToggle(writeScope);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}

function toggleScopeValue(
  current: ApiTokenScope[],
  scope: ApiTokenScope,
  allowed: Set<ApiTokenScope>,
): ApiTokenScope[] {
  if (!allowed.has(scope)) return current;
  if (current.includes(scope)) {
    return current.filter((item) => item !== scope);
  }
  return API_TOKEN_SCOPES.filter(
    (item) => item === scope || current.includes(item),
  );
}

function CreateTokenDialog({
  open,
  onClose,
  onCreated,
  availableScopes,
  defaultScopes,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (token: string) => void;
  availableScopes: ApiTokenScope[];
  defaultScopes: ApiTokenScope[];
}) {
  const t = useTranslations("account");
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(() => [...defaultScopes]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const allowed = new Set(availableScopes);

  function reset() {
    setName("");
    setExpiresAt("");
    setScopes([...defaultScopes]);
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
    if (scopes.length === 0) {
      setError(t("apiTokenScopesRequired"));
      return;
    }
    startTransition(async () => {
      const result = await createApiTokenAction({
        name,
        expiresAt: expiresAt.trim() || undefined,
        scopes,
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
        <PermissionMatrix
          idPrefix="api-token-create"
          availableScopes={availableScopes}
          scopes={scopes}
          pending={pending}
          onToggle={(scope) =>
            setScopes((current) => toggleScopeValue(current, scope, allowed))
          }
        />
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
            disabled={pending || scopes.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("apiTokenCreating") : t("apiTokenCreateAction")}
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}

function EditTokenPermissionsDialog({
  token,
  availableScopes,
  onClose,
  onSaved,
}: {
  token: ApiTokenListItemDto | null;
  availableScopes: ApiTokenScope[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("account");
  const open = token != null;
  const [scopes, setScopes] = useState<ApiTokenScope[]>(() =>
    (token?.scopes ?? []).filter((scope): scope is ApiTokenScope =>
      (API_TOKEN_SCOPES as readonly string[]).includes(scope),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const allowed = new Set(availableScopes);

  function handleClose() {
    if (pending) return;
    setError(null);
    onClose();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    if (scopes.length === 0) {
      setError(t("apiTokenScopesRequired"));
      return;
    }
    startTransition(async () => {
      const result = await updateApiTokenScopesAction({
        id: token.id,
        scopes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <PortalDialog
      open={open}
      title={t("apiTokenEditPermissionsTitle")}
      onClose={handleClose}
      closeDisabled={pending}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm text-muted">
          {t("apiTokenEditPermissionsHelp", { name: token?.name ?? "" })}
        </p>
        <PermissionMatrix
          idPrefix={`api-token-edit-${token?.id ?? "none"}`}
          availableScopes={availableScopes}
          scopes={scopes}
          pending={pending}
          onToggle={(scope) =>
            setScopes((current) => toggleScopeValue(current, scope, allowed))
          }
        />
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
            disabled={pending || scopes.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("apiTokenSavingPermissions") : t("apiTokenSavePermissions")}
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
  regenerated = false,
}: {
  open: boolean;
  token: string;
  onClose: () => void;
  regenerated?: boolean;
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
      title={
        regenerated ? t("apiTokenRegeneratedTitle") : t("apiTokenCreatedTitle")
      }
      onClose={onClose}
    >
      <div className="grid gap-4">
        <p className="text-sm text-amber-800">
          {regenerated
            ? t("apiTokenRegeneratedWarning")
            : t("apiTokenCreatedWarning")}
        </p>
        <div className="flex items-start gap-2">
          <code className="block min-w-0 flex-1 break-all rounded-md border border-border bg-background px-3 py-2 text-xs">
            {token}
          </code>
          <button
            type="button"
            onClick={copyToken}
            aria-label={copied ? t("apiTokenCopied") : t("apiTokenCopy")}
            title={copied ? t("apiTokenCopied") : t("apiTokenCopy")}
            className="shrink-0 rounded-md border border-border p-2 text-foreground hover:bg-foreground/5"
          >
            <CopyIcon />
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
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

function RegenerateTokenDialog({
  token,
  onClose,
  onRegenerated,
}: {
  token: ApiTokenListItemDto | null;
  onClose: () => void;
  onRegenerated: (secret: string) => void;
}) {
  const t = useTranslations("account");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = token != null;

  function handleClose() {
    if (pending) return;
    setError(null);
    onClose();
  }

  function onConfirm() {
    if (!token) return;
    setError(null);
    startTransition(async () => {
      const result = await regenerateApiTokenAction(token.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRegenerated(result.token);
    });
  }

  return (
    <PortalDialog
      open={open}
      title={t("apiTokenRegenerateTitle")}
      onClose={handleClose}
      closeDisabled={pending}
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted">
          {t("apiTokenRegenerateHelp", { name: token?.name ?? "" })}
        </p>
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
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("apiTokenRegenerating") : t("apiTokenRegenerateConfirm")}
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
  const [availableScopes, setAvailableScopes] = useState<ApiTokenScope[]>([
    ...API_TOKEN_SCOPES.filter((scope) => scope.startsWith("qso:")),
  ]);
  const [defaultScopes, setDefaultScopes] = useState<ApiTokenScope[]>([
    ...API_TOKEN_SCOPES.filter((scope) => scope.startsWith("qso:")),
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [editToken, setEditToken] = useState<ApiTokenListItemDto | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [regenerateToken, setRegenerateToken] =
    useState<ApiTokenListItemDto | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdWasRegenerated, setCreatedWasRegenerated] = useState(false);
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
    setAvailableScopes(result.availableScopes);
    setDefaultScopes(result.defaultScopes);
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
      setAvailableScopes(result.availableScopes);
      setDefaultScopes(result.defaultScopes);
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
              {" · "}
              <a
                href={`${apiPublicUrl.replace(/\/$/, "")}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {t("apiTokenDocsLink")}
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateKey((key) => key + 1);
              setCreateOpen(true);
            }}
            disabled={pending || loading}
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
                  {token.scopes.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {token.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted"
                        >
                          {scope}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {t("apiTokenCreatedAt")}: {formatDate(token.createdAt)}
                    {" · "}
                    {t("apiTokenLastUsed")}: {formatDate(token.lastUsedAt)}
                    {token.expiresAt
                      ? ` · ${t("apiTokenExpires")}: ${formatDate(token.expiresAt)}`
                      : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEditKey((key) => key + 1);
                      setEditToken(token);
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-foreground/5 disabled:opacity-60"
                  >
                    {t("apiTokenEditPermissions")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRegenerateToken(token)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-foreground/5 disabled:opacity-60"
                  >
                    {t("apiTokenRegenerate")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revokeToken(token.id)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {t("apiTokenRevoke")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <CreateTokenDialog
        key={`create-${createKey}`}
        open={createOpen}
        availableScopes={availableScopes}
        defaultScopes={defaultScopes}
        onClose={() => setCreateOpen(false)}
        onCreated={(token) => {
          setCreateOpen(false);
          setCreatedWasRegenerated(false);
          setCreatedToken(token);
          setLoading(true);
          void reloadTokens();
        }}
      />

      <EditTokenPermissionsDialog
        key={`edit-${editKey}`}
        token={editToken}
        availableScopes={availableScopes}
        onClose={() => setEditToken(null)}
        onSaved={() => {
          setEditToken(null);
          setLoading(true);
          void reloadTokens();
        }}
      />

      <RegenerateTokenDialog
        token={regenerateToken}
        onClose={() => setRegenerateToken(null)}
        onRegenerated={(secret) => {
          setRegenerateToken(null);
          setCreatedWasRegenerated(true);
          setCreatedToken(secret);
          setLoading(true);
          void reloadTokens();
        }}
      />

      <TokenCreatedDialog
        open={createdToken != null}
        token={createdToken ?? ""}
        regenerated={createdWasRegenerated}
        onClose={() => {
          setCreatedToken(null);
          setCreatedWasRegenerated(false);
        }}
      />
    </>
  );
}
