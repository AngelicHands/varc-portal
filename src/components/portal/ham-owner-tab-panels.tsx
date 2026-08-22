"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { AccountProfileForm } from "@/components/portal/account-profile-form";
import { SecuritySettingsForm } from "@/components/portal/security-settings-form";
import { SecurityTabPanel } from "@/components/portal/security-tab-panel";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";
import { loadHamOwnerTabDataAction } from "@/lib/account-actions";
import type { AccountProfileDto, UserDocumentDto } from "@/lib/account-types";

type OwnerTabData = {
  profile: AccountProfileDto;
  documents: UserDocumentDto[];
};

type OwnerTabContextValue = {
  loading: boolean;
  error: string | null;
  data: OwnerTabData | null;
  reload: () => void;
  ensureLoaded: () => void;
};

const OwnerTabContext = createContext<OwnerTabContextValue | null>(null);

function TabStatus({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center"
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  );
}

function TabSpinner() {
  return (
    <span
      className="inline-block size-4 animate-spin rounded-full border-2 border-muted border-t-accent"
      aria-hidden
    />
  );
}

function useOwnerTabData(): OwnerTabContextValue {
  const value = useContext(OwnerTabContext);
  if (!value) {
    throw new Error("Owner tab panels must be wrapped in HamOwnerTabDataProvider");
  }
  return value;
}

export function HamOwnerTabDataProvider({ children }: { children: ReactNode }) {
  const [wanted, setWanted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OwnerTabData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const ensureLoaded = useCallback(() => {
    setWanted(true);
  }, []);

  const reload = useCallback(() => {
    setWanted(true);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!wanted) return;

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      void loadHamOwnerTabDataAction().then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setData(null);
          setLoading(false);
          return;
        }
        setData({ profile: result.profile, documents: result.documents });
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [wanted, reloadToken]);

  const value = useMemo(
    () => ({ loading, error, data, reload, ensureLoaded }),
    [loading, error, data, reload, ensureLoaded],
  );

  return (
    <OwnerTabContext.Provider value={value}>{children}</OwnerTabContext.Provider>
  );
}

function OwnerTabGate({
  children,
}: {
  children: (data: OwnerTabData) => ReactNode;
}) {
  const t = useTranslations("ham");
  const { loading, error, data, reload, ensureLoaded } = useOwnerTabData();

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  if ((loading || !data) && !error) {
    return (
      <TabStatus>
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <TabSpinner />
          {t("tabLoading")}
        </span>
      </TabStatus>
    );
  }

  if (error || !data) {
    return (
      <TabStatus>
        <p className="max-w-md text-sm text-red-700">{error ?? t("tabLoadFailed")}</p>
        <button
          type="button"
          onClick={reload}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/5"
        >
          {t("tabRetry")}
        </button>
      </TabStatus>
    );
  }

  return <>{children(data)}</>;
}

export function HamOwnerProfileTabPanel() {
  return (
    <OwnerTabGate>
      {(data) => (
        <AccountProfileForm
          initial={{
            name: data.profile.name,
            email: data.profile.email,
            callsign: data.profile.callsign,
            callsignVerified: data.profile.callsignVerified,
            callsignVerificationStatus: data.profile.callsignVerificationStatus,
            birthday: data.profile.birthday,
            gender: data.profile.gender,
            homeGrid: data.profile.homeGrid,
            homeLat: data.profile.homeLat,
            homeLng: data.profile.homeLng,
          }}
          initialDocuments={data.documents}
        />
      )}
    </OwnerTabGate>
  );
}

export function HamOwnerDocumentsTabPanel() {
  const accountT = useTranslations("account");

  return (
    <OwnerTabGate>
      {(data) => (
        <UserDocumentsPanel
          initialDocuments={data.documents}
          uploadEndpoint="/api/account/documents"
          variant="panels"
          labels={{
            certificate: accountT("certificate"),
            license: accountT("license"),
            upload: accountT("upload"),
            uploading: accountT("uploading"),
            uploadFailed: accountT("uploadFailed"),
            delete: accountT("delete"),
            deleteFailed: accountT("deleteFailed"),
            noDocuments: accountT("noDocuments"),
          }}
        />
      )}
    </OwnerTabGate>
  );
}

export function HamOwnerPrivacyTabPanel() {
  return (
    <OwnerTabGate>
      {(data) => (
        <SecuritySettingsForm
          initial={{
            isProfilePublic: data.profile.isProfilePublic,
            isQsoPublic: data.profile.isQsoPublic,
          }}
        />
      )}
    </OwnerTabGate>
  );
}

export function HamOwnerSecurityTabPanel() {
  return (
    <OwnerTabGate>
      {(data) => <SecurityTabPanel hasPassword={data.profile.hasPassword} />}
    </OwnerTabGate>
  );
}

export function HamOwnerQslTabPanel() {
  const t = useTranslations("ham");
  return (
    <TabStatus>
      <p className="max-w-md text-sm text-muted">{t("qslComingSoon")}</p>
    </TabStatus>
  );
}
