/**
 * Layer 2 — Factual Accuracy Verifier
 *
 * Implements the verifier prompt from
 * docs/features/QUESTION_ACQUISITION_STRATEGY.md §3.2.
 *
 * Sent a question + marked answer + source, returns JSON matching
 * `factualVerifierResponseSchema`:
 *   - is the question factually accurate?
 *   - is the marked answer correct?
 *   - are all distractors plausible + definitively wrong?
 *   - is any distractor actually also correct (ambiguous)?
 *   - quality verdict + 0-1 confidence
 *   - reference textbook the verifier cites
 *
 * Runs on a DIFFERENT provider than the question's source model
 * (worker layer 2 chooses the provider at call-time) so you get a
 * second opinion rather than the same model agreeing with itself.
 */

import {
  VERIFICATION_REFERENCES,
  getReferencesForCategory,
  type VerificationCategory,
} from "../../config/verification-references.js";

export interface QuestionVerifierPromptParams {
  /** "Kerala PSC Assistant Professor Pharmacy 2026" */
  examName: string;
  /** Domain the subject-matter expert should role-play. Defaults to the
   *  question's subject string — can be overridden for niche domains. */
  subjectDomain: string;
  /** Target level for difficulty appropriateness check. Freeform — e.g.
   *  "Assistant Professor", "Postgraduate", "Drug Inspector". */
  examLevel?: string;
  /** Textbooks the verifier should cite. Explicit pass-through — wins
   *  over `category` if both are provided. */
  referenceTextbooks?: string[];
  /** Verification category from `verification-references.ts`. If given
   *  (and no explicit `referenceTextbooks`), the prompt pulls the
   *  category's primary texts and the category-specific fact-check
   *  addendum + common-error list. */
  category?: VerificationCategory;
  /** Engineering branch hint (CS / EC / ME / EE / CE) used with
   *  category = "engineering" to pick branch-specific texts. */
  engineeringBranch?: string | null;

  /** The question being verified. */
  question: string;
  options: string[];
  /** 0-indexed, or free-form letter / text. */
  markedAnswer: number | string;
  explanation?: string | null;
  /** Provenance string ("Kerala PSC 2022, Q.45" or "AI Generated"). */
  source: string;
}

const DEFAULT_PHARMACY_TEXTBOOKS = VERIFICATION_REFERENCES.pharmacy.primaryTexts;

function formatLetteredOptions(options: string[]): string {
  return options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join("\n");
}

function formatMarkedAnswer(marked: number | string, options: string[]): string {
  if (typeof marked === "number") {
    const letter = String.fromCharCode(65 + marked);
    const text = options[marked] ?? "";
    return `${letter} — ${text}`;
  }
  return String(marked);
}

export function buildQuestionVerifierPrompt(params: QuestionVerifierPromptParams): {
  systemPrompt: string;
  prompt: string;
} {
  const {
    examName,
    subjectDomain,
    examLevel = "the stated exam level",
    referenceTextbooks,
    category,
    engineeringBranch,
    question,
    options,
    markedAnswer,
    explanation,
    source,
  } = params;

  // Resolve references in priority: explicit list > category list > pharmacy fallback.
  const refs =
    referenceTextbooks ??
    (category ? getReferencesForCategory(category, engineeringBranch) : DEFAULT_PHARMACY_TEXTBOOKS);

  const categoryAddendum = category
    ? `\n\n${VERIFICATION_REFERENCES[category].factCheckPromptAddition}`
    : "";
  const commonErrors = category ? VERIFICATION_REFERENCES[category].commonErrors : [];
  const commonErrorsBlock =
    commonErrors.length > 0
      ? `\n\nActively look for these common errors:\n${commonErrors.map((e) => `- ${e}`).join("\n")}`
      : "";

  const systemPrompt = `You are a ${subjectDomain} subject-matter expert verifying MCQ questions
for Indian competitive exams. You verify factual accuracy, answer
correctness, and question quality. You role-play a meticulous examiner
who does NOT rubber-stamp questions — if anything is wrong or
ambiguous, you flag it.

You reference standard textbooks:
${refs.map((t) => `- ${t}`).join("\n")}${categoryAddendum}${commonErrorsBlock}

Your output MUST be valid JSON matching the schema provided.`;

  const optionsBlock = formatLetteredOptions(options);
  const markedBlock = formatMarkedAnswer(markedAnswer, options);
  const explanationBlock = explanation ? `\nCurrent explanation: ${explanation}` : "";

  const prompt = `Verify this ${subjectDomain} MCQ for ${examName}.

Question: ${question}

Options:
${optionsBlock}

Marked Answer: ${markedBlock}
Source: ${source}${explanationBlock}

Verify each of the following and produce the JSON:

1. Is the question factually accurate? (If any stated fact is wrong,
   the whole question fails.)
2. Is the marked answer correct? If not, which option IS correct
   and why?
3. Are all distractors (wrong options) plausible but definitively
   wrong?
4. Is any distractor ALSO correct (ambiguous question)? If yes, this
   is a flag — the question has multiple valid answers.
5. Is the question appropriate for ${examLevel}?
   - Too easy  → pitched at a lower level than ${examLevel}
   - Appropriate → matches ${examLevel}
   - Too hard  → PhD / research level
6. Rate the question overall: excellent / good / acceptable / poor /
   incorrect.

OUTPUT: JSON with these exact keys (factualVerifierResponseSchema):
{
  "isFactuallyCorrect": boolean,
  "isAnswerCorrect": boolean,
  "correctAnswer": "letter or text (null if marked answer is correct)",
  "explanation": "why you verdicted as you did, in 2-4 sentences",
  "issues": ["short strings — one per problem found (empty if none)"],
  "quality": "excellent|good|acceptable|poor|incorrect",
  "confidence": 0.0-1.0,
  "suggestedFix": "how to fix, if you found an issue; null otherwise",
  "referenceSource": "e.g. 'KD Tripathi, Ch.12, pg.145' or null"
}

Do NOT guess. If you are unsure, set confidence low and explain. If
you cannot verify from the listed references, say so in
referenceSource and lower confidence.`;

  return { systemPrompt, prompt };
}
