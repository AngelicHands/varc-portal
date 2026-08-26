import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { executeImportExportJob } from "@/lib/import-export/execute-job";
import { getImportExportJobDocument } from "@/lib/import-export/jobs";
import { isWorkerInternalAuthorized } from "@/lib/worker-internal-auth";
import { logServerError, workerErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const maxDuration = 900;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isWorkerInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  try {
    await executeImportExportJob(id);
    const job = await getImportExportJobDocument(id);
    if (job?.kind === "import" || job?.kind === "export") {
      revalidatePath("/admin/import-export", "page");
      revalidatePath("/admin/background-jobs", "page");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("import-export-run", error);
    revalidatePath("/admin/import-export", "page");
    revalidatePath("/admin/background-jobs", "page");
    return NextResponse.json(
      { error: workerErrorMessage(error, "Job execution failed") },
      { status: 500 },
    );
  }
}
