import { requireSitePage } from "@/lib/admin-access";
import { AdminRouteTabs } from "@/components/admin/admin-route-tabs";
import { HlsPosterJobsManager } from "@/components/admin/hls-poster-jobs-manager";
import { listHlsPosterJobs } from "@/lib/hls-poster/jobs";

export const dynamic = "force-dynamic";

const TABS = [
  {
    id: "hls-poster",
    label: "HLS poster",
    href: "/admin/background-jobs",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function resolveTab(tab: string | undefined): TabId {
  void tab;
  return "hls-poster";
}

export default async function AdminBackgroundJobsPage({ searchParams }: Props) {
  await requireSitePage();
  const { tab } = await searchParams;
  const activeTab = resolveTab(tab);
  const jobs = await listHlsPosterJobs();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Background Jobs</h1>
      <p className="mt-2 text-sm text-gray-600">
        Queue and monitor background workers. Start with HLS poster jobs that
        generate video thumbnails for embeds missing posters.
      </p>

      <AdminRouteTabs tabs={[...TABS]} active={activeTab} />

      <div className="mt-8">
        {activeTab === "hls-poster" ? (
          <HlsPosterJobsManager initialJobs={jobs} />
        ) : null}
      </div>
    </div>
  );
}
