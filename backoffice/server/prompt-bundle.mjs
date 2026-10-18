import { z } from "zod";

export const MAX_IMPORT_BYTES = 256000;
export const PROMPT_BUNDLE_FORMAT = "ai-kundetypeassistent-prompts-v1";
export const promptImportItem = z
  .object({
    name: z.string().trim().min(1).max(80),
    instructions: z
      .string()
      .min(1)
      .max(48000)
      .refine((value) => !!value.trim()),
    sourceRef: z.string().trim().max(150).default(""),
  })
  .strict();
export const promptImport = z
  .object({
    projectRef: z
      .string()
      .trim()
      .regex(/^proj_[A-Za-z0-9_-]{3,100}$/)
      .optional(),
    prompts: z.array(promptImportItem).min(1).max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    const names = value.prompts.map((item) => item.name.toLowerCase());
    if (new Set(names).size !== names.length)
      ctx.addIssue({ code: "custom", message: "Duplicate prompt names" });
    if (
      new TextEncoder().encode(JSON.stringify(value)).length > MAX_IMPORT_BYTES
    )
      ctx.addIssue({ code: "custom", message: "Import too large" });
  });
