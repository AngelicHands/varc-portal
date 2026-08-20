import NextLink from "next/link";
import { requireUsersPage } from "@/lib/admin-access";
import { countUserQsos } from "@/lib/qso";
import { connectDb } from "@/lib/db";
import { listUserDocuments } from "@/lib/user-documents";
import { User } from "@/models/User";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: Props) {
  await requireUsersPage();
  const { id } = await params;

  await connectDb();
  const user = await User.findById(id).lean();
  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">User not found</h1>
        <NextLink href="/admin/users" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
          Back to users
        </NextLink>
      </div>
    );
  }

  const [qsoCount, documents] = await Promise.all([
    countUserQsos(id),
    listUserDocuments(id),
  ]);

  return (
    <div>
      <NextLink href="/admin/users" className="text-sm text-blue-700 hover:underline">
        ← Back to users
      </NextLink>
      <h1 className="mt-4 text-2xl font-semibold">{user.name}</h1>
      <p className="mt-1 text-sm text-gray-600">{user.email}</p>

      <dl className="mt-6 grid max-w-xl gap-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
          <dt className="text-gray-600">Callsign</dt>
          <dd className="font-medium uppercase">{user.callsign?.trim() || "—"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
          <dt className="text-gray-600">QSO count</dt>
          <dd className="font-medium">{qsoCount}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={`/api/admin/qso/export?userId=${encodeURIComponent(id)}`}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          Export ADIF
        </a>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">Documents</h2>
        <UserDocumentsPanel
          initialDocuments={documents}
          uploadEndpoint={`/api/admin/users/${id}/documents`}
        />
      </section>
    </div>
  );
}
