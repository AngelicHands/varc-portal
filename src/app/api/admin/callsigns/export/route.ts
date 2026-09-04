import { NextResponse } from "next/server";
import { requireCallsignAdminApi } from "@/lib/admin-api";
import { type CallsignListFilters } from "@/lib/callsigns-admin";
import {
  parseOperatorKindFilter,
  parsePermitTypeFilter,
} from "@/lib/callsigns-filters";
import {
  buildCallsignExportRows,
  callsignExportContentType,
  callsignExportCsv,
  callsignExportFilename,
  callsignExportJson,
  callsignExportXlsx,
  parseCallsignExportFormat,
  parseCallsignExportScope,
} from "@/lib/callsigns-export";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

function parseFilters(input: {
  operatorKind?: unknown;
  permitType?: unknown;
}): CallsignListFilters {
  return {
    operatorKind: parseOperatorKindFilter(input.operatorKind),
    permitType: parsePermitTypeFilter(input.permitType),
  };
}

export async function POST(request: Request) {
  const session = await requireCallsignAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const filters = parseFilters(body);
    const format = parseCallsignExportFormat(body.format);
    const scope = parseCallsignExportScope(body.scope);
    const rows = await buildCallsignExportRows(filters, scope);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No callsigns match the selected filters" },
        { status: 404 },
      );
    }

    const filename = callsignExportFilename(format);
    const bodyBuffer =
      format === "csv"
        ? callsignExportCsv(rows)
        : format === "json"
          ? callsignExportJson(rows)
          : await callsignExportXlsx(rows);

    return new NextResponse(new Uint8Array(bodyBuffer), {
      status: 200,
      headers: {
        "Content-Type": callsignExportContentType(format),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to export callsigns") },
      { status: 500 },
    );
  }
}
