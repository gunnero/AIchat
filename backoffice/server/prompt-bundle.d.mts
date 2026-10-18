import type { ZodType } from "zod";
export const MAX_IMPORT_BYTES: number;
export const PROMPT_BUNDLE_FORMAT: string;
export const promptImport: ZodType<{
  projectRef?: string;
  prompts: { name: string; instructions: string; sourceRef: string }[];
}>;
