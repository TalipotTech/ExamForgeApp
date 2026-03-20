import { streamText, Output, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { mistral } from "@ai-sdk/mistral";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { perplexity } from "@ai-sdk/perplexity";
import { z } from "zod";
import { generateQuestionsInputSchema } from "@examforge/shared/validators";
import { AI_PROVIDER_INFO, QUESTION_TYPE_LABELS } from "@examforge/shared/constants";
import { questionOutputSchema } from "@/lib/ai-schemas";

type Provider = "anthropic" | "mistral" | "openai" | "google" | "perplexity";

function getModel(provider: Provider): LanguageModel {
  const info = AI_PROVIDER_INFO[provider];
  switch (provider) {
    case "anthropic":
      return anthropic(info.model);
    case "mistral":
      return mistral(info.model);
    case "openai":
      return openai(info.model);
    case "google":
      return google(info.model);
    case "perplexity":
      return perplexity(info.model);
  }
}

function buildPrompt(input: z.infer<typeof generateQuestionsInputSchema>): string {
  const typeLabel = QUESTION_TYPE_LABELS[input.questionType];

  const typeInstructions: Record<string, string> = {
    mcq: `Each question must have exactly 4 options (strings) and an "answer" field (0-3 index of correct option).`,
    true_false: `Each question must have a boolean "answer" field (true or false).`,
    fill_blank: `Each question must use "___" for the blank. Provide "answer" (string) and optionally "acceptableAnswers" (array of alternative correct answers).`,
    match: `Each question must have "pairs" (array of {left, right} objects, minimum 2 pairs).`,
    assertion: `Each question must have "assertion", "reason", and "answer" which is one of: "both_true_reason_correct", "both_true_reason_incorrect", "assertion_true_reason_false", "both_false".`,
  };

  const parts: string[] = [];

  if (input.syllabusContext) {
    parts.push(`=== STUDY MATERIAL CONTEXT (PRIMARY SOURCE) ===
The following is the official study material for this topic. Base your questions primarily on this content. Prefer facts, definitions, and concepts from this material over your general knowledge:

${input.syllabusContext}
=== END STUDY MATERIAL ===`);
  }

  const examContext = input.examName ? `\n- Exam: ${input.examName}` : "";
  const subjectLine = input.subject ? `\n- Subject: ${input.subject}` : "";
  parts.push(`You are an expert exam question generator for Indian competitive exams.

Generate exactly ${input.count} ${typeLabel} questions for the following:${examContext}${subjectLine}
- Topic: ${input.topic}
- Difficulty: ${input.difficulty}
- Question Type: ${typeLabel}

${typeInstructions[input.questionType]}

Every question MUST include an "explanation" field (minimum 20 characters) that thoroughly explains why the answer is correct.

Each question's "content" object must have a "type" field set to "${input.questionType}".
Set "subject" to "${input.subject ?? "General"}", "topic" to "${input.topic}", and "difficulty" to "${input.difficulty}" for each question.

Requirements:
- Questions must be factually accurate and exam-appropriate
- Explanations should be educational and reference key concepts
- Avoid duplicate or near-duplicate questions
- Difficulty should match: easy (recall), medium (application), hard (analysis/synthesis)`);

  if (input.existingQuestionTexts && input.existingQuestionTexts.length > 0) {
    const existing = input.existingQuestionTexts.slice(0, 50).join("\n- ");
    parts.push(`\n=== EXISTING QUESTIONS (DO NOT DUPLICATE) ===
The following questions already exist for this topic. Generate completely different questions that do NOT overlap with or paraphrase these:
- ${existing}
=== END EXISTING QUESTIONS ===`);
  }

  if (input.customPrompt) {
    parts.push(`\nAdditional instructions from user:\n${input.customPrompt}`);
  }

  return parts.join("\n\n");
}

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const input = generateQuestionsInputSchema.parse(body);
  const model = getModel(input.provider);

  const result = streamText({
    model,
    output: Output.object({ schema: questionOutputSchema }),
    prompt: buildPrompt(input),
    maxRetries: 3,
  });

  return result.toTextStreamResponse();
}
