import { z } from "zod";

export const tutorialSectionTypeSchema = z.enum([
  "introduction",
  "explanation",
  "definition",
  "formula",
  "example",
  "application",
  "summary",
  "references",
]);

export const tutorialSectionSchema = z.object({
  type: tutorialSectionTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  provider: z.string().optional(),
  key_terms: z.array(z.string()).optional(),
});

export const keyDefinitionSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
});

export const formulaSchema = z.object({
  name: z.string().min(1),
  formula: z.string().min(1),
  explanation: z.string().min(1),
});

export const mnemonicSchema = z.object({
  topic: z.string().min(1),
  mnemonic: z.string().min(1),
});

export const tutorialContentSchema = z.object({
  sections: z.array(tutorialSectionSchema).min(1),
  learning_objectives: z.array(z.string().min(1)).min(1),
  key_definitions: z.array(keyDefinitionSchema),
  formulas: z.array(formulaSchema).optional(),
  mnemonics: z.array(mnemonicSchema).optional(),
  clinical_applications: z.array(z.string()).optional(),
  difficulty_level: z.enum(["introductory", "intermediate", "advanced"]),
});

export type TutorialSectionType = z.infer<typeof tutorialSectionTypeSchema>;
export type TutorialSection = z.infer<typeof tutorialSectionSchema>;
export type KeyDefinition = z.infer<typeof keyDefinitionSchema>;
export type Formula = z.infer<typeof formulaSchema>;
export type Mnemonic = z.infer<typeof mnemonicSchema>;
export type TutorialContentValidator = z.infer<typeof tutorialContentSchema>;
