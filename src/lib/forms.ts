import { z } from "zod";
import { cacheAside, CmsCacheTags } from "@/lib/cache/cms-cache";
import { connectDb } from "@/lib/db";
import { makeSlug, uniqueSlugFromTitle } from "@/lib/slug";
import { notDeletedFilter } from "@/lib/soft-delete";
import {
  FormDefinition,
  type FormDefinitionDocument,
} from "@/models/FormDefinition";
import {
  FormSubmission,
  type FormSubmissionDocument,
} from "@/models/FormSubmission";
import type {
  FormFieldDefinition,
  FormSubmissionStatus,
} from "@/lib/validations/forms";
import { getValkey } from "@/lib/cache/valkey";
import { logServerError } from "@/lib/safe-error";

export type PublicFormField = FormFieldDefinition;

export type PublicFormDefinition = {
  id: string;
  key: string;
  name: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  fields: PublicFormField[];
};

export type AdminFormListItem = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: "draft" | "published";
  fieldCount: number;
  deletedAt: string | null;
  updatedAt: string | null;
};

export type AdminFormOption = {
  id: string;
  label: string;
  key: string;
  status: "draft" | "published";
};

export type AdminFormSubmissionItem = {
  id: string;
  formId: string;
  formNameSnapshot: string;
  status: FormSubmissionStatus;
  payload: Record<string, string | boolean>;
  createdAt: string | null;
  pagePath: string;
};

function toPublicForm(doc: FormDefinitionDocument): PublicFormDefinition {
  return {
    id: String(doc._id),
    key: doc.key,
    name: doc.name,
    description: doc.description ?? "",
    submitLabel: doc.submitLabel ?? "Send",
    successMessage:
      doc.successMessage ?? "Thank you. Your submission has been received.",
    fields: (doc.fields ?? []).map((field) => ({
      id: field.id,
      type: field.type,
      name: field.name,
      label: field.label,
      required: Boolean(field.required),
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? "",
      width: field.width ?? "full",
      options: (field.options ?? []).map((option) => ({
        label: option.label,
        value: option.value,
      })),
    })),
  };
}

function toAdminFormListItem(doc: FormDefinitionDocument): AdminFormListItem {
  return {
    id: String(doc._id),
    key: doc.key,
    name: doc.name,
    description: doc.description ?? "",
    status: doc.status,
    fieldCount: doc.fields?.length ?? 0,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

function toSubmissionItem(doc: FormSubmissionDocument): AdminFormSubmissionItem {
  return {
    id: String(doc._id),
    formId: String(doc.formId),
    formNameSnapshot: doc.formNameSnapshot,
    status: doc.status,
    payload: (doc.payload ?? {}) as Record<string, string | boolean>,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    pagePath: doc.pagePath ?? "",
  };
}

export async function listForms(options?: { trash?: boolean }) {
  await connectDb();
  const filter = options?.trash ? { deletedAt: { $ne: null } } : notDeletedFilter;
  const docs = await FormDefinition.find(filter)
    .sort(options?.trash ? { deletedAt: -1 } : { updatedAt: -1, createdAt: -1 })
    .lean<FormDefinitionDocument[]>();
  return docs.map(toAdminFormListItem);
}

export async function listFormOptions(): Promise<AdminFormOption[]> {
  await connectDb();
  const docs = await FormDefinition.find(notDeletedFilter)
    .sort({ name: 1, updatedAt: -1 })
    .lean<FormDefinitionDocument[]>();
  return docs.map((doc) => ({
    id: String(doc._id),
    label: doc.name,
    key: doc.key,
    status: doc.status,
  }));
}

export async function getFormById(id: string) {
  await connectDb();
  return FormDefinition.findById(id).lean<FormDefinitionDocument | null>();
}

export async function getPublishedFormById(id: string) {
  return cacheAside(
    `cms:form:id:${id}`,
    [CmsCacheTags.forms],
    async () => {
      await connectDb();
      const doc = await FormDefinition.findOne({
        _id: id,
        ...notDeletedFilter,
        status: "published",
      }).lean<FormDefinitionDocument | null>();
      return doc ? toPublicForm(doc) : null;
    },
    {
      tagsFromValue: (form) =>
        form?.id ? [CmsCacheTags.form(String(form.id))] : [],
    },
  );
}

export async function listFormSubmissions(formId: string) {
  await connectDb();
  const docs = await FormSubmission.find({ formId })
    .sort({ createdAt: -1 })
    .lean<FormSubmissionDocument[]>();
  return docs.map(toSubmissionItem);
}

export async function getFormSubmissionById(id: string) {
  await connectDb();
  const doc = await FormSubmission.findById(id).lean<FormSubmissionDocument | null>();
  return doc ? toSubmissionItem(doc) : null;
}

export async function countNewFormSubmissions(formId: string): Promise<number> {
  await connectDb();
  return FormSubmission.countDocuments({ formId, status: "new" });
}

export async function createUniqueFormKey(
  name: string,
  excludeId?: string | null,
): Promise<string> {
  return uniqueSlugFromTitle(name, async (slug) => {
    await connectDb();
    const filter: Record<string, unknown> = {
      ...notDeletedFilter,
      key: slug,
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return Boolean(await FormDefinition.exists(filter));
  });
}

function allowedOptions(field: FormFieldDefinition): Set<string> {
  return new Set((field.options ?? []).map((option) => option.value));
}

export function validateSubmissionPayload(
  fields: FormFieldDefinition[],
  input: Record<string, unknown>,
): {
  ok: true;
  data: Record<string, string | boolean>;
} | {
  ok: false;
  error: string;
} {
  const payload: Record<string, string | boolean> = {};

  for (const field of fields) {
    const raw = input[field.name];

    if (field.type === "checkbox") {
      const checked =
        raw === true ||
        raw === "true" ||
        raw === "on" ||
        raw === "1" ||
        raw === 1;
      if (field.required && !checked) {
        return { ok: false, error: `${field.label} is required` };
      }
      payload[field.name] = checked;
      continue;
    }

    const value =
      typeof raw === "string"
        ? raw.trim()
        : raw == null
          ? ""
          : String(raw).trim();

    if (field.required && !value) {
      return { ok: false, error: `${field.label} is required` };
    }

    if (!value) {
      payload[field.name] = "";
      continue;
    }

    if (field.type === "email") {
      const parsed = z.string().email().safeParse(value);
      if (!parsed.success) {
        return { ok: false, error: `${field.label} must be a valid email` };
      }
    }

    if (field.type === "phone") {
      const parsed = z
        .string()
        .regex(/^[+\d()[\]\s.-]{6,30}$/)
        .safeParse(value);
      if (!parsed.success) {
        return { ok: false, error: `${field.label} must be a valid phone number` };
      }
    }

    if (field.type === "date") {
      const parsed = z.string().date().safeParse(value);
      if (!parsed.success) {
        return { ok: false, error: `${field.label} must be a valid date` };
      }
    }

    if (field.type === "select" || field.type === "radio") {
      if (!allowedOptions(field).has(value)) {
        return { ok: false, error: `${field.label} has an invalid selection` };
      }
    }

    payload[field.name] = value;
  }

  return { ok: true, data: payload };
}

export async function createFormSubmission(params: {
  form: PublicFormDefinition;
  payload: Record<string, string | boolean>;
  pagePath?: string;
  ipHash?: string;
  userAgent?: string;
}) {
  await connectDb();
  const created = await FormSubmission.create({
    formId: params.form.id,
    formNameSnapshot: params.form.name,
    formKeySnapshot: params.form.key,
    payload: params.payload,
    status: "new",
    pagePath: params.pagePath ?? "",
    ipHash: params.ipHash ?? "",
    userAgent: params.userAgent ?? "",
  });
  return toSubmissionItem(created.toObject() as FormSubmissionDocument);
}

export async function allowFormSubmission(
  fingerprint: string,
  limit = 10,
  windowSec = 60,
): Promise<boolean> {
  const client = await getValkey();
  if (!client) return true;

  const key = `rate:form:${makeSlug(fingerprint).slice(0, 80)}`;
  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSec);
    }
    return count <= limit;
  } catch (error) {
    logServerError("form rate limit", error);
    return true;
  }
}
