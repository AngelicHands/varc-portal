import { z } from "zod";

const MAX_TEXT = 5_000;

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "select",
  "checkbox",
  "radio",
  "date",
] as const;

export const FORM_FIELD_WIDTHS = ["full", "half"] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export type FormFieldWidth = (typeof FORM_FIELD_WIDTHS)[number];

export const formFieldOptionSchema = z.object({
  label: z.string().trim().min(1, "Option label is required").max(200),
  value: z.string().trim().min(1, "Option value is required").max(200),
});

export type FormFieldOption = z.infer<typeof formFieldOptionSchema>;

export const formFieldSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    type: z.enum(FORM_FIELD_TYPES),
    name: z
      .string()
      .trim()
      .min(1, "Field key is required")
      .max(64)
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Field key must start with a letter and use only lowercase letters, numbers, and underscores",
      ),
    label: z.string().trim().min(1, "Field label is required").max(200),
    required: z.boolean(),
    placeholder: z.string().trim().max(500).default(""),
    helpText: z.string().trim().max(MAX_TEXT).default(""),
    width: z.enum(FORM_FIELD_WIDTHS).default("full"),
    options: z.array(formFieldOptionSchema).max(100).default([]),
  })
  .superRefine((field, ctx) => {
    if (field.type === "select" || field.type === "radio") {
      if (field.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Select and radio fields need at least one option",
          path: ["options"],
        });
      }
      return;
    }
    if (field.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Only select and radio fields may define options",
        path: ["options"],
      });
    }
  });

export type FormFieldDefinition = z.infer<typeof formFieldSchema>;

export const formDefinitionFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(MAX_TEXT).default(""),
    status: z.enum(["draft", "published"]),
    submitLabel: z.string().trim().min(1, "Submit label is required").max(120),
    successMessage: z
      .string()
      .trim()
      .min(1, "Success message is required")
      .max(MAX_TEXT),
    fields: z.array(formFieldSchema).min(1, "Add at least one field").max(100),
  })
  .superRefine((data, ctx) => {
    const names = new Set<string>();
    for (const [index, field] of data.fields.entries()) {
      if (names.has(field.name)) {
        ctx.addIssue({
          code: "custom",
          message: "Field keys must be unique",
          path: ["fields", index, "name"],
        });
      }
      names.add(field.name);
    }

    if (data.status === "published" && data.fields.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Published forms need at least one field",
        path: ["fields"],
      });
    }
  });

export type FormDefinitionFormValues = z.input<typeof formDefinitionFormSchema>;

export const FORM_SUBMISSION_STATUSES = ["new", "reviewed", "archived"] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export function makeFormFieldId(): string {
  return `fld_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyFormField(
  type: FormFieldType = "text",
): FormFieldDefinition {
  return {
    id: makeFormFieldId(),
    type,
    name: "",
    label: "",
    required: false,
    placeholder: "",
    helpText: "",
    width: "full",
    options:
      type === "select" || type === "radio"
        ? [{ label: "Option 1", value: "option-1" }]
        : [],
  };
}

export const emptyFormDefinitionForm: FormDefinitionFormValues = {
  name: "",
  description: "",
  status: "draft",
  submitLabel: "Send",
  successMessage: "Thank you. Your submission has been received.",
  fields: [emptyFormField("text")],
};
