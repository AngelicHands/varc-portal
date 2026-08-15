import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import {
  buildImportEvent,
  isoDay,
  type ImportPayload,
} from "@/lib/callsigns-parse";
import { foldSearchText } from "@/lib/callsigns-normalize";

const MAX_XLSX_BYTES = 5 * 1024 * 1024;

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return isoDay(value) ?? "";
  if (typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellText((value as { result?: unknown }).result);
  }
  if (typeof value === "object" && "richText" in value) {
    const parts = (value as { richText?: Array<{ text?: string }> }).richText;
    return (parts ?? []).map((part) => part.text ?? "").join("").trim();
  }
  return String(value).trim();
}

function cellDate(value: unknown): string | null {
  if (value instanceof Date) return isoDay(value);
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return isoDay(date);
  }
  const text = cellText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [d, m, y] = text.split("/");
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return isoDay(iso);
  }
  return isoDay(text);
}

function headerKey(label: string): string | null {
  const folded = foldSearchText(label);
  if (folded === "stt" || folded === "no" || folded === "stt no") return "stt";
  if (
    folded === "ho ten" ||
    folded === "name" ||
    folded === "operator" ||
    folded === "ten"
  ) {
    return "name";
  }
  if (
    folded === "ho hieu" ||
    folded === "callsign" ||
    folded === "call sign" ||
    folded === "call"
  ) {
    return "callsign";
  }
  if (
    folded === "giay phep" ||
    folded === "license" ||
    folded === "permit" ||
    folded === "licence"
  ) {
    return "permit";
  }
  if (
    folded === "ngay cap" ||
    folded === "issued" ||
    folded === "issue date" ||
    folded === "issued at"
  ) {
    return "issued";
  }
  if (
    folded === "ngay het han" ||
    folded === "expiry" ||
    folded === "expires" ||
    folded === "expiration" ||
    folded === "expires at"
  ) {
    return "expiry";
  }
  if (folded === "ghi chu" || folded === "notes" || folded === "note") {
    return "notes";
  }
  return null;
}

export async function parseCallsignXlsx(
  buffer: Buffer,
  sourceFile: string,
): Promise<ImportPayload> {
  if (buffer.byteLength > MAX_XLSX_BYTES) {
    throw new Error("Excel file must be 5MB or smaller");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheets");

  const headerMap = new Map<number, string>();
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, col) => {
    const key = headerKey(cellText(cell.value));
    if (key) headerMap.set(col, key);
  });

  if (!headerMap.size) {
    throw new Error(
      "Could not read headers. Expected columns such as STT, Họ tên, Hô hiệu, Giấy phép, Ngày cấp, Ngày hết hạn, Ghi chú.",
    );
  }

  const events = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const raw: Record<string, unknown> = {};
    headerMap.forEach((key, col) => {
      raw[key] = row.getCell(col).value;
    });
    const name = cellText(raw.name);
    const callsignRaw = cellText(raw.callsign);
    if (!name && !callsignRaw) continue;

    const sttRaw = cellText(raw.stt);
    const stt = Number.parseInt(sttRaw, 10);
    events.push(
      buildImportEvent({
        stt: Number.isFinite(stt) && stt > 0 ? stt : events.length + 1,
        name,
        callsignRaw,
        permitRaw: cellText(raw.permit),
        issuedAt: cellDate(raw.issued),
        expiresAt: cellDate(raw.expiry),
        notes: cellText(raw.notes),
      }),
    );
  }

  if (events.length === 0) {
    throw new Error("No callsign rows found in the spreadsheet");
  }

  const digest = createHash("sha1").update(buffer).digest("hex").slice(0, 12);
  return {
    importKey: `xlsx-${digest}`,
    sourceFile: sourceFile || "upload.xlsx",
    sourceCreated: new Date().toISOString(),
    importedForDate: new Date().toISOString().slice(0, 10),
    rowCount: events.length,
    events,
  };
}
