import { streamText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { generateQuestionsInputSchema } from "@examforge/shared/validators";
import {
  AI_PROVIDER_INFO,
  QUESTION_TYPE_LABELS,
} from "@examforge/shared/constants";
import { questionOutputSchema } from "@/lib/ai-schemas";

function getModel(provider: "anthropic" | "mistral") {
  const info = AI_PROVIDER_INFO[provider];
  if (provider === "anthropic") {
    return anthropic(info.model);
  }
  return mistral(info.model);
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

  const base = `You are an expert exam question generator for Indian competitive exams.

Generate exactly ${input.count} ${typeLabel} questions for the following:
- Subject: ${input.subject}
- Topic: ${input.topic}
- Difficulty: ${input.difficulty}
- Question Type: ${typeLabel}

${typeInstructions[input.questionType]}

Every question MUST include an "explanation" field (minimum 20 characters) that thoroughly explains why the answer is correct.

Each question's "content" object must have a "type" field set to "${input.questionType}".
Set "subject" to "${input.subject}", "topic" to "${input.topic}", and "difficulty" to "${input.difficulty}" for each question.

Requirements:
- Questions must be factually accurate and exam-appropriate
- Explanations should be educational and reference key concepts
- Avoid duplicate or near-duplicate questions
- Difficulty should match: easy (recall), medium (application), hard (analysis/synthesis)`;

  if (input.customPrompt) {
    return `${base}\n\nAdditional instructions from user:\n${input.customPrompt}`;
  }

  return base;
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
