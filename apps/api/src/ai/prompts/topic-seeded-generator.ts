/**
 * Topic-Seeded Generator
 *
 * Implements the generation prompt from
 * docs/features/QUESTION_ACQUISITION_STRATEGY.md §4.3.
 *
 * Unlike random generation, this prompt is given N REAL questions on
 * a specific topic as examples, plus an analysis of what aspects /
 * styles / difficulties those seeds cover, plus which aspects are
 * UNTESTED. It's told to generate only within proven patterns — so
 * output quality tracks real-exam quality closely.
 *
 * Output validated against `topicSeededGenerationResponseSchema` from
 * packages/shared/src/validators/question-verification.ts.
 */

/** Minimal seed-question shape the prompt needs. */
export interface SeedQuestion {
  question: string;
  options: string[];
  /** 0-indexed answer. */
  answer: number;
  explanation?: string | null;
  source: string;
  difficulty?: "easy" | "medium" | "hard";
  style?: string;
  /** Optional: year the seed comes from, for "don't repeat" context. */
  year?: number;
}

export interface TopicSeededGeneratorParams {
  /** "Kerala PSC Assistant Professor Pharmacy 2026" */
  examName: string;
  /** Topic we're generating on, e.g. "Drug Metabolism". */
  topicName: string;
  /** Optional unit context, e.g. "Unit 3: Pharmacology". */
  unitName?: string;

  /** Real seed questions on this topic — the generator uses these as
   *  both style examples AND as "do NOT repeat these" anchors. */
  seedQuestions: SeedQuestion[];

  /** Aspects already covered by seeds (from worker analysis). The
   *  generator will SKIP these to avoid duplication. */
  coveredAspects: string[];
  /** Aspects in the syllabus but NOT yet tested. The generator targets
   *  these — expansion of coverage. */
  untestedAspects: string[];

  /** Difficulty distribution the generator should match
   *  (e.g. ["medium", "medium", "medium", "hard"]). */
  difficultyDistribution: Array<"easy" | "medium" | "hard">;
  /** Styles the seeds use, for pattern-matching. */
  stylesUsed: string[];

  /** How many new questions this batch produces. */
  count: number;
  /** Textbook references the generator must cite in factSource. */
  textbookReferences: string[];
}

function formatSeed(q: SeedQuestion, idx: number): string {
  const letters = q.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n   ");
  const answerLetter = String.fromCharCode(65 + q.answer);
  const yr = q.year ? ` (${q.year})` : "";
  const diff = q.difficulty ? ` [${q.difficulty}]` : "";
  const style = q.style ? ` [${q.style}]` : "";
  return `Seed #${idx + 1} — ${q.source}${yr}${diff}${style}
   Q: ${q.question}
   ${letters}
   Answer: ${answerLetter}`;
}

export function buildTopicSeededGeneratorPrompt(params: TopicSeededGeneratorParams): {
  systemPrompt: string;
  prompt: string;
} {
  const {
    examName,
    topicName,
    unitName,
    seedQuestions,
    coveredAspects,
    untestedAspects,
    difficultyDistribution,
    stylesUsed,
    count,
    textbookReferences,
  } = params;

  const systemPrompt = `You generate exam MCQs that match real ${examName} patterns.

CRITICAL RULES (non-negotiable):

1. Every fact you state MUST be verifiable in the provided standard
   textbooks. If you're not certain a fact is in those references,
   DO NOT include it.

2. Every drug name, disease, enzyme, mechanism, dosage, or molecule
   must be real and clinically accurate.

3. Distractors (wrong options) must be plausible but DEFINITIVELY
   wrong. Do NOT write distractors that are "also correct" — every
   question must have exactly one correct answer.

4. Do NOT generate questions on topics NOT covered by the seed
   examples. Stay within the topic.

5. Match the difficulty distribution of the seeds exactly.

6. Use the SAME question styles as the seeds. If seeds are mostly
   direct-recall MCQs with some assertion-reason, mirror that ratio.

7. Do NOT repeat ideas that seed questions already cover — the whole
   point of this batch is to expand coverage to UNTESTED aspects.

8. For every generated question, populate:
   - aspectCovered: specific aspect (e.g. "CYP450 2C9 substrate drugs")
   - factSource: textbook + chapter/page (e.g. "KD Tripathi Ch.12")
   Only cite textbooks from the approved list.

Your output MUST be valid JSON matching the provided schema and
contain exactly ${count} question objects in the 'questions' array.`;

  const unitBlock = unitName ? `Unit: ${unitName}\n` : "";
  const seedsBlock = seedQuestions
    .slice(0, 20)
    .map((q, i) => formatSeed(q, i))
    .join("\n\n");
  const coveredBlock = coveredAspects.length
    ? `\nAspects already covered by seeds (AVOID repeating these):\n${coveredAspects
        .map((a) => `- ${a}`)
        .join("\n")}`
    : "";
  const untestedBlock = untestedAspects.length
    ? `\nUntested aspects to COVER in this batch:\n${untestedAspects
        .map((a) => `- ${a}`)
        .join("\n")}`
    : "\nNo pre-identified untested aspects — expand the topic coverage generally.";

  const diffString = difficultyDistribution.length
    ? difficultyDistribution.join(", ")
    : "medium (default)";

  const stylesString = stylesUsed.length ? stylesUsed.join(", ") : "direct_recall (default)";

  const textbookBlock = textbookReferences.map((t) => `- ${t}`).join("\n");

  const prompt = `Generate ${count} NEW questions for ${examName} on the topic
"${topicName}".

${unitBlock}
=== REAL SEED QUESTIONS ===
${seedsBlock}

=== ANALYSIS OF SEEDS ===
- Styles used: ${stylesString}
- Difficulty for this batch: ${diffString}
${coveredBlock}
${untestedBlock}

=== APPROVED TEXTBOOK REFERENCES ===
${textbookBlock}

Generate ${count} questions that:
1. Cover the UNTESTED aspects listed above (if any).
2. Use DIFFERENT drugs/molecules/examples than the seeds.
3. Follow the SAME question styles and difficulty distribution.
4. Are factually verifiable in the approved textbooks.
5. Have plausible, definitively-wrong distractors.
6. Include aspectCovered and factSource for every question.

OUTPUT JSON (topicSeededGenerationResponseSchema):
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": 0-3,
      "explanation": "...",
      "difficulty": "easy|medium|hard",
      "style": "direct_recall | choose_correct | assertion_reason | clinical_case | ...",
      "aspectCovered": "specific aspect tested",
      "factSource": "textbook reference"
    }
    // ... exactly ${count} items
  ]
}`;

  return { systemPrompt, prompt };
}
