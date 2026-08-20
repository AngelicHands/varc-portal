import NextLink from "next/link";
import { requireUsersPage } from "@/lib/admin-access";
import { AdminUserProfileForm } from "@/components/admin/admin-user-profile-form";
import { CallsignStatusCard } from "@/components/admin/callsign-status-card";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";
import { listAssignableRoles } from "@/lib/app-roles";
import { connectDb } from "@/lib/db";
import { countUserQsos } from "@/lib/qso";
import { normalizeRoleKey } from "@/lib/roles";
import { listUserDocuments } from "@/lib/user-documents";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function formatDate(value: Date | string | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN");
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "verified" | "unverified" | "empty";
}) {
  const toneClass =
    tone === "verified"
      ? "border-green-300 bg-green-50"
      : tone === "unverified"
        ? "border-amber-300 bg-amber-50"
        : "border-gray-200 bg-white";
  const labelClass =
    tone === "verified"
      ? "text-green-700"
      : tone === "unverified"
        ? "text-amber-800"
        : "text-gray-500";
  const valueClass =
    tone === "verified"
      ? "text-green-900"
      : tone === "unverified"
        ? "text-amber-950"
        : "text-gray-900";
  const hintClass =
    tone === "verified"
      ? "text-green-800"
      : tone === "unverified"
        ? "text-amber-800"
        : "text-gray-600";

  return (
    <div className={`rounded-lg border p-5 ${toneClass}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${labelClass}`}>
        {label}
      </p>
      <p className={`mt-2 truncate text-2xl font-semibold ${valueClass}`}>
        {value}
      </p>
      {hint ? <p className={`mt-1 text-sm ${hintClass}`}>{hint}</p> : null}
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: Props) {
  await requireUsersPage();
  const { id } = await params;

  await connectDb();
  const user = await User.findById(id).lean();
  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">User not found</h1>
        <NextLink
          href="/admin/users"
          className="mt-4 inline-block text-sm text-blue-700 hover:underline"
        >
          Back to users
        </NextLink>
      </div>
    );
  }

  const [qsoCount, documents, roles] = await Promise.all([
    countUserQsos(id),
    listUserDocuments(id),
    listAssignableRoles(),
  ]);

  const roleKey = normalizeRoleKey(user.role);
  const roleLabel =
    roles.find((role) => role.key === roleKey)?.label || roleKey;
  const callsign = user.callsign?.trim() || "";
  const callsignVerified = Boolean(user.callsignVerified) && Boolean(callsign);
  const certificateCount = documents.filter(
    (doc) => doc.kind === "certificate",
  ).length;
  const licenseCount = documents.filter((doc) => doc.kind === "license").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{user.name}</h1>
          <p className="mt-1 text-sm text-gray-600">{user.email}</p>
        </div>
        <NextLink
          href="/admin/users"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to users
        </NextLink>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CallsignStatusCard
          userId={id}
          callsign={callsign}
          verified={callsignVerified}
        />
        <StatCard label="Role" value={roleLabel} />
        <StatCard
          label="QSOs"
          value={String(qsoCount)}
          hint="Logged contacts"
        />
        <StatCard
          label="Documents"
          value={String(documents.length)}
          hint={`${certificateCount} certificate · ${licenseCount} license`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="mt-1 mb-4 text-sm text-gray-600">
            Update the member name and callsign.
          </p>
          <AdminUserProfileForm
            userId={id}
            initialName={user.name}
            initialCallsign={user.callsign?.trim() ?? ""}
            initialCallsignVerified={callsignVerified}
          />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Logbook</h2>
          <p className="mt-1 text-sm text-gray-600">
            {qsoCount === 0
              ? "No QSOs logged yet."
              : `${qsoCount} QSO${qsoCount === 1 ? "" : "s"} in this logbook.`}
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
              <dt className="text-gray-600">Member since</dt>
              <dd className="font-medium">{formatDate(user.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
              <dt className="text-gray-600">Callsign</dt>
              <dd className="font-medium uppercase">
                {callsign || "—"}
                {callsign ? (
                  <span
                    className={`ml-2 font-normal normal-case ${
                      callsignVerified ? "text-green-700" : "text-amber-700"
                    }`}
                  >
                    ({callsignVerified ? "verified" : "not verified"})
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
          <a
            href={`/api/admin/qso/export?userId=${encodeURIComponent(id)}`}
            className="mt-5 inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Export ADIF
          </a>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Documents</h2>
        <UserDocumentsPanel
          initialDocuments={documents}
          uploadEndpoint={`/api/admin/users/${id}/documents`}
          tone="admin"
        />
      </section>
    </div>
  );
}
