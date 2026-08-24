import ExcelJS from "exceljs";
import { queryAdminCallsigns, type CallsignListFilters } from "@/lib/callsigns-admin";
import { connectDb } from "@/lib/db";
import { CallsignLicense } from "@/models/CallsignLicense";

export const CALLSIGN_EXPORT_FORMATS = ["xlsx", "csv", "json"] as const;
export type CallsignExportFormat = (typeof CALLSIGN_EXPORT_FORMATS)[number];
export const CALLSIGN_EXPORT_SCOPES = ["latest", "events"] as const;
export type CallsignExportScope = (typeof CALLSIGN_EXPORT_SCOPES)[number];

export type CallsignExportRow = {
  stt: number;
  operatorName: string;
  sign: string;
  permitRaw: string;
  issuedAt: string;
  expiresAt: string;
  notes: string;
  status: string;
};

const HEADERS = [
  "STT",
  "Họ tên",
  "Hô hiệu",
  "Giấy phép",
  "Ngày cấp",
  "Ngày hết hạn",
  "Ghi chú",
  "Status",
] as const;

export function parseCallsignExportFormat(
  value: unknown,
): CallsignExportFormat {
  if (value === "csv" || value === "json" || value === "xlsx") return value;
  return "xlsx";
}

export function parseCallsignExportScope(value: unknown): CallsignExportScope {
  return value === "events" ? "events" : "latest";
}

function dayText(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export async function buildCallsignExportRows(
  filters: CallsignListFilters,
  scope: CallsignExportScope,
): Promise<CallsignExportRow[]> {
  const callsigns = await queryAdminCallsigns({
    ...filters,
    permitMatch: scope === "events" ? "any" : "latest",
  });
  if (scope === "latest") {
    return callsigns.map((item, index) => ({
      stt: index + 1,
      operatorName: item.operatorName,
      sign: item.sign,
      permitRaw: item.permitRaw,
      issuedAt: item.issuedAt ?? "",
      expiresAt: item.expiresAt ?? "",
      notes: "",
      status: item.status,
    }));
  }

  await connectDb();
  const signs = callsigns.map((item) => item.sign);
  if (signs.length === 0) return [];
  const selected = new Set(signs);

  const licenseQuery: Record<string, unknown> = {
    callsigns: { $in: signs },
  };
  if (filters.permitType && filters.permitType !== "all") {
    licenseQuery.permitType = filters.permitType;
  }

  const licenses = await CallsignLicense.find(licenseQuery)
    .sort({ stt: 1, issuedAt: 1 })
    .lean();

  const rows: CallsignExportRow[] = [];
  for (const row of licenses) {
    const matching = (row.callsigns ?? []).filter((sign) =>
      selected.has(String(sign).toUpperCase()),
    );
    const targets = matching.length
      ? matching
      : row.callsignRaw
        ? [row.callsignRaw]
        : [];
    for (const sign of targets) {
      rows.push({
        stt: Number.isFinite(row.stt) && row.stt > 0 ? row.stt : rows.length + 1,
        operatorName: row.operatorName ?? "",
        sign: String(sign).toUpperCase(),
        permitRaw: row.permitRaw ?? "",
        issuedAt: dayText(row.issuedAt),
        expiresAt: dayText(row.expiresAt),
        notes: row.notes ?? "",
        status: row.status ?? "",
      });
    }
  }
  return rows;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function callsignExportCsv(rows: CallsignExportRow[]): Buffer {
  const lines = [
    HEADERS.join(","),
    ...rows.map((row) =>
      [
        String(row.stt),
        csvEscape(row.operatorName),
        csvEscape(row.sign),
        csvEscape(row.permitRaw),
        row.issuedAt,
        row.expiresAt,
        csvEscape(row.notes),
        row.status,
      ].join(","),
    ),
  ];
  return Buffer.from(`\uFEFF${lines.join("\r\n")}`, "utf8");
}

export function callsignExportJson(rows: CallsignExportRow[]): Buffer {
  return Buffer.from(JSON.stringify(rows, null, 2), "utf8");
}

export async function callsignExportXlsx(
  rows: CallsignExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Callsigns");
  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow([
      row.stt,
      row.operatorName,
      row.sign,
      row.permitRaw,
      row.issuedAt,
      row.expiresAt,
      row.notes,
      row.status,
    ]);
  }
  sheet.columns = HEADERS.map(() => ({ width: 18 }));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function callsignExportFilename(
  format: CallsignExportFormat,
  now = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `varc-callsigns-${stamp}.${format}`;
}

export function callsignExportContentType(format: CallsignExportFormat): string {
  if (format === "csv") return "text/csv; charset=utf-8";
  if (format === "json") return "application/json; charset=utf-8";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
