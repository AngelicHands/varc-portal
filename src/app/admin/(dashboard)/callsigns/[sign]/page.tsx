import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCallsignsPage } from "@/lib/admin-access";
import { getAdminCallsign } from "@/lib/callsigns-admin";
import { CallsignEditor } from "@/components/admin/callsign-editor";

type Props = {
  params: Promise<{ sign: string }>;
};

export default async function EditCallsignPage({ params }: Props) {
  await requireCallsignsPage();
  const { sign } = await params;
  const record = await getAdminCallsign(sign);
  if (!record) notFound();

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/admin/callsigns" className="text-gray-600 hover:underline">
          Callsigns
        </Link>
      </p>
      <h1 className="mb-6 font-mono text-2xl font-semibold">{record.sign}</h1>
      <CallsignEditor record={record} />
    </div>
  );
}
