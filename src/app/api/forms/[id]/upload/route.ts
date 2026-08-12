import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  allowFormSubmission,
  getPublishedFormById,
} from "@/lib/forms";
import { getMediaConfig } from "@/lib/media/config";
import { buildObjectKey, putObject } from "@/lib/media/storage";
import { logServerError, publicErrorMessage } from "@/lib/safe-error";
import {
  matchesAllowedUploadExtension,
  FORM_UPLOAD_FILE_MIME,
  FORM_UPLOAD_IMAGE_MIME,
  FORM_UPLOAD_MAX_BYTES,
} from "@/lib/validations/forms";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const form = await getPublishedFormById(id);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Form not found" },
        { status: 404 },
      );
    }

    const headerBag = await headers();
    const forwarded = headerBag.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    const allowed = await allowFormSubmission(`upload:${id}:${ip}`, 20, 60);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many uploads. Please try again shortly." },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const fieldName = String(formData.get("field") ?? "").trim();
    const file = formData.get("file");

    if (!fieldName) {
      return NextResponse.json(
        { ok: false, error: "Missing field name" },
        { status: 400 },
      );
    }

    const field = form.fields.find((item) => item.name === fieldName);
    if (!field || (field.type !== "image" && field.type !== "file")) {
      return NextResponse.json(
        { ok: false, error: "Invalid upload field" },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing file" },
        { status: 400 },
      );
    }

    const contentType = (file.type || "").toLowerCase();
    const allowedMime =
      field.type === "image"
        ? (FORM_UPLOAD_IMAGE_MIME as readonly string[])
        : (FORM_UPLOAD_FILE_MIME as readonly string[]);

    if (!allowedMime.includes(contentType)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            field.type === "image"
              ? "Unsupported image type. Use JPEG, PNG, GIF, or WebP."
              : `Unsupported file type: ${contentType || "unknown"}`,
        },
        { status: 400 },
      );
    }

    if (!matchesAllowedUploadExtension(file.name, field.allowedExtensions)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            field.allowedExtensions.length > 0
              ? `Only these file extensions are allowed: ${field.allowedExtensions.join(", ")}`
              : "This file extension is not allowed.",
        },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > FORM_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: `File size must be between 1 byte and ${Math.floor(
            FORM_UPLOAD_MAX_BYTES / (1024 * 1024),
          )}MB`,
        },
        { status: 400 },
      );
    }

    const config = getMediaConfig();
    if (file.size > config.maxBytes) {
      return NextResponse.json(
        { ok: false, error: "File exceeds storage limit" },
        { status: 400 },
      );
    }

    const originalName = String(file.name || "upload.bin").slice(0, 200);
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `form-uploads/${id}/${buildObjectKey(originalName)}`;
    const stored = await putObject(key, buffer, contentType);

    return NextResponse.json(
      {
        ok: true,
        url: stored.url,
        key: stored.key,
        contentType: stored.contentType,
        size: stored.size,
        originalName,
        field: fieldName,
      },
      { status: 201 },
    );
  } catch (error) {
    logServerError("form upload", error);
    return NextResponse.json(
      {
        ok: false,
        error: publicErrorMessage(error, "Failed to upload file"),
      },
      { status: 500 },
    );
  }
}
