import { z } from "zod";

export const permitTypeSchema = z.enum([
  "GP",
  "GH",
  "VARC",
  "unknown",
  "missing",
]);

export const operatorKindSchema = z.enum(["person", "org"]);

const licenseSchema = z.object({
  id: z.string().optional(),
  permitRaw: z.string().trim().max(80),
  permitType: permitTypeSchema.optional(),
  issuedAt: z.string().trim().max(10).nullable(),
  expiresAt: z.string().trim().max(10).nullable(),
  notes: z.string().trim().max(500),
});

export const callsignFormSchema = z.object({
  sign: z
    .string()
    .trim()
    .min(3, "Callsign is required")
    .max(16)
    .transform((value) => value.toUpperCase()),
  operatorName: z.string().trim().min(1, "Operator name is required").max(160),
  operatorKind: operatorKindSchema,
  licenses: z
    .array(licenseSchema)
    .min(1, "Add at least one license event")
    .max(50),
});

export type CallsignFormValues = z.input<typeof callsignFormSchema>;
