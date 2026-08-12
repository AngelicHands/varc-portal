import { cacheAside, CmsCacheTags } from "@/lib/cache/cms-cache";
import { connectDb } from "@/lib/db";
import { makeSlug, uniqueSlugFromTitle } from "@/lib/slug";
import { notDeletedFilter } from "@/lib/soft-delete";
import type { AppLocale } from "@/i18n/routing";
import {
  FormDefinition,
  type FormDefinitionDocument,
} from "@/models/FormDefinition";
import {
  FormSubmission,
  type FormSubmissionDocument,
} from "@/models/FormSubmission";
import type {
  FormDefinitionFormValues,
  FormFieldDefinition,
  FormLocaleValues,
  FormSubmissionValue,
  FormSubmissionStatus,
} from "@/lib/validations/forms";
import {
  normalizeChoiceOptions,
  normalizeFormDateFormat,
  normalizeFormFieldTypingStyles,
  normalizeFormFieldTypingAlignment,
  normalizeFormFieldWidth,
  normalizeFormTimeFormat,
  validateSubmissionPayload,
} from "@/lib/validations/forms";
import { getValkey } from "@/lib/cache/valkey";
import { logServerError } from "@/lib/safe-error";

export { validateSubmissionPayload };

export type PublicFormField = FormFieldDefinition;

export type PublicFormDefinition = {
  id: string;
  key: string;
  name: string;
  description: string;
  schemaMarkdown: string;
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
  payload: Record<string, FormSubmissionValue>;
  createdAt: string | null;
  pagePath: string;
};

type StoredFormLocale = {
  name?: string | null;
  description?: string | null;
  submitLabel?: string | null;
  successMessage?: string | null;
  schemaMarkdown?: string | null;
  fields?: FormFieldDefinition[] | null;
};

function mapFields(
  fields: Array<Partial<FormFieldDefinition>> | null | undefined,
): FormFieldDefinition[] {
  return (fields ?? []).map((field) => ({
    id: String(field.id ?? ""),
    type: field.type as FormFieldDefinition["type"],
    name: String(field.name ?? ""),
    label: String(field.label ?? ""),
    required: Boolean(field.required),
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    maxLength: field.maxLength ?? 0,
    width: normalizeFormFieldWidth(field.width),
    style: field.style ?? "default",
    typingStyle: normalizeFormFieldTypingStyles(field.typingStyle),
    typingAlignment: normalizeFormFieldTypingAlignment(field.typingAlignment),
    dateFormat: normalizeFormDateFormat(field.dateFormat),
    timeFormat: normalizeFormTimeFormat(field.timeFormat),
    checked: Boolean(field.checked),
    options: normalizeChoiceOptions(
      (field.type as FormFieldDefinition["type"]) ?? "text",
      (field.options ?? []).map((option) => ({
        label: option.label,
        value: option.value,
        checked: Boolean(option.checked),
      })),
    ),
  }));
}

function emptyLocale(): FormLocaleValues {
  return {
    name: "",
    description: "",
    submitLabel: "",
    successMessage: "",
    schemaMarkdown: "",
    fields: [],
  };
}

function fromStoredLocale(
  locale: StoredFormLocale | null | undefined,
  fallback?: FormLocaleValues,
): FormLocaleValues {
  const base = fallback ?? emptyLocale();
  if (!locale) return { ...base, fields: [...(base.fields ?? [])] };
  return {
    name: locale.name?.trim() || base.name || "",
    description: locale.description ?? base.description ?? "",
    submitLabel: locale.submitLabel?.trim() || base.submitLabel || "",
    successMessage:
      locale.successMessage?.trim() || base.successMessage || "",
    schemaMarkdown: locale.schemaMarkdown ?? base.schemaMarkdown ?? "",
    fields:
      locale.fields && locale.fields.length > 0
        ? mapFields(locale.fields)
        : mapFields(base.fields),
  };
}

/** Normalize document locales with legacy flat-field fallback. */
export function getFormLocales(doc: FormDefinitionDocument): {
  vi: FormLocaleValues;
  en: FormLocaleValues;
} {
  const legacy: FormLocaleValues = {
    name: doc.name ?? "",
    description: doc.description ?? "",
    submitLabel: doc.submitLabel ?? "Send",
    successMessage:
      doc.successMessage ?? "Thank you. Your submission has been received.",
    schemaMarkdown: doc.schemaMarkdown ?? "",
    fields: mapFields(doc.fields),
  };

  const stored = doc.locales as
    | { vi?: StoredFormLocale; en?: StoredFormLocale }
    | null
    | undefined;

  if (!stored?.vi && !stored?.en) {
    return {
      vi: legacy,
      en: emptyLocale(),
    };
  }

  return {
    vi: fromStoredLocale(stored.vi, legacy),
    en: fromStoredLocale(stored.en, emptyLocale()),
  };
}

function localeHasFormBody(locale: FormLocaleValues) {
  return (
    (locale.schemaMarkdown ?? "").trim().length > 0 ||
    (locale.fields?.length ?? 0) > 0
  );
}

export function resolveFormLocale(
  doc: FormDefinitionDocument,
  locale: AppLocale,
): FormLocaleValues {
  const locales = getFormLocales(doc);
  const preferred = locale === "en" ? locales.en : locales.vi;
  const fallback = locales.vi;

  return {
    name: (preferred.name ?? "").trim() || fallback.name || "",
    description:
      (preferred.description ?? "").trim() || fallback.description || "",
    submitLabel:
      (preferred.submitLabel ?? "").trim() ||
      fallback.submitLabel ||
      (locale === "en" ? "Send" : "Gửi"),
    successMessage:
      (preferred.successMessage ?? "").trim() ||
      fallback.successMessage ||
      (locale === "en"
        ? "Thank you. Your submission has been received."
        : "Cảm ơn bạn. Chúng tôi đã nhận được thông tin."),
    schemaMarkdown: localeHasFormBody(preferred)
      ? preferred.schemaMarkdown || ""
      : fallback.schemaMarkdown || "",
    fields: localeHasFormBody(preferred)
      ? mapFields(preferred.fields)
      : mapFields(fallback.fields),
  };
}

export function inferFormDefinitionMode(
  doc: FormDefinitionDocument,
): "fields" | "markdown" {
  const stored = (doc as { definitionMode?: string }).definitionMode;
  if (stored === "markdown" || stored === "fields") return stored;
  const locales = getFormLocales(doc);
  return (locales.vi.schemaMarkdown ?? "").trim() ? "markdown" : "fields";
}

export function toAdminFormValues(
  doc: FormDefinitionDocument,
): FormDefinitionFormValues {
  const locales = getFormLocales(doc);
  return {
    status: doc.status,
    definitionMode: inferFormDefinitionMode(doc),
    locales: {
      vi: {
        ...locales.vi,
        fields: mapFields(locales.vi.fields),
      },
      en: {
        ...locales.en,
        fields: mapFields(locales.en.fields),
      },
    },
  };
}

function toPublicForm(
  doc: FormDefinitionDocument,
  locale: AppLocale = "vi",
): PublicFormDefinition {
  const resolved = resolveFormLocale(doc, locale);
  return {
    id: String(doc._id),
    key: doc.key,
    name: resolved.name || "",
    description: resolved.description ?? "",
    schemaMarkdown: resolved.schemaMarkdown ?? "",
    submitLabel: resolved.submitLabel || (locale === "en" ? "Send" : "Gửi"),
    successMessage:
      resolved.successMessage ||
      (locale === "en"
        ? "Thank you. Your submission has been received."
        : "Cảm ơn bạn. Chúng tôi đã nhận được thông tin."),
    fields: mapFields(resolved.fields),
  };
}

function toAdminFormListItem(doc: FormDefinitionDocument): AdminFormListItem {
  const locales = getFormLocales(doc);
  return {
    id: String(doc._id),
    key: doc.key,
    name: locales.vi.name || doc.name,
    description: locales.vi.description || doc.description || "",
    status: doc.status,
    fieldCount: locales.vi.fields?.length || doc.fields?.length || 0,
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
    payload: (doc.payload ?? {}) as Record<string, FormSubmissionValue>,
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
  return docs.map((doc) => {
    const locales = getFormLocales(doc);
    return {
      id: String(doc._id),
      label: locales.vi.name || doc.name,
      key: doc.key,
      status: doc.status,
    };
  });
}

export async function getFormById(id: string) {
  await connectDb();
  return FormDefinition.findById(id).lean<FormDefinitionDocument | null>();
}

export async function getPublishedFormById(
  id: string,
  locale: AppLocale = "vi",
) {
  const localeKey = locale === "en" ? "en" : "vi";
  return cacheAside(
    `cms:form:id:${id}:${localeKey}`,
    [CmsCacheTags.forms],
    async () => {
      await connectDb();
      const doc = await FormDefinition.findOne({
        _id: id,
        ...notDeletedFilter,
        status: "published",
      }).lean<FormDefinitionDocument | null>();
      return doc ? toPublicForm(doc, localeKey) : null;
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

export async function createFormSubmission(params: {
  form: PublicFormDefinition;
  payload: Record<string, FormSubmissionValue>;
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
