import type { ExamFingerprint } from "@examforge/shared/db/schema";

type GenerationConfig = {
  totalQuestions: number;
  includeRepeats: boolean;
  includeCurrentAffairs: boolean;
  yearFocus?: number;
};

export function buildPatternGenerationPrompt(
  fingerprint: ExamFingerprint,
  config: GenerationConfig,
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You generate exam questions that precisely match a real exam's pattern.
You follow the exact subject weightage, difficulty distribution, question styles, and language patterns from analyzed previous year papers.
Generate realistic, exam-quality questions that would fit naturally in a real exam paper.`;

  // Build subject weightage table
  const subjectWeightageTable = fingerprint.subjectWeightage
    .map((sw) => {
      const qCount = Math.round((sw.averagePercent / 100) * config.totalQuestions);
      return `- ${sw.subject}: ${sw.averagePercent.toFixed(1)}% (${qCount} questions)`;
    })
    .join("\n");

  // Build difficulty counts
  const dd = fingerprint.difficultyDistribution;
  const easyCount = Math.round((dd.easy / 100) * config.totalQuestions);
  const mediumCount = Math.round((dd.medium / 100) * config.totalQuestions);
  const hardCount = config.totalQuestions - easyCount - mediumCount;

  // Build style distribution table
  const styleTable = fingerprint.styleDistribution
    .filter((s) => s.percent > 0)
    .map((s) => {
      const count = Math.round((s.percent / 100) * config.totalQuestions);
      return `- ${s.style}: ${s.percent.toFixed(1)}% (~${count} questions)`;
    })
    .join("\n");

  // Build top topics list
  const topTopics = fingerprint.topicFrequency
    .filter((t) => t.importance === "must_study" || t.importance === "high")
    .slice(0, 30)
    .map(
      (t) =>
        `- ${t.subject} > ${t.topic} (appears in ${t.appearsInPercent.toFixed(0)}% of papers, ~${t.avgQuestionsPerPaper.toFixed(1)} Qs/paper)`,
    )
    .join("\n");

  // Build section structure
  const sectionStructure =
    fingerprint.structure.sections.length > 0
      ? fingerprint.structure.sections
          .map(
            (s) =>
              `- Q${s.questionRange[0]}-${s.questionRange[1]}: ${s.name} (focus: ${s.subjectFocus.join(", ")})`,
          )
          .join("\n")
      : "No specific section structure detected — distribute subjects naturally.";

  // Repeat calculation
  const repeatRate = fingerprint.repeatAnalysis.overallRepeatRate;
  const repeatCount = config.includeRepeats
    ? Math.round((repeatRate / 100) * config.totalQuestions)
    : 0;

  // Current affairs
  const currentAffairsCount = config.includeCurrentAffairs
    ? Math.max(1, Math.round(config.totalQuestions * 0.05))
    : 0;

  // Language patterns
  const lp = fingerprint.languagePatterns;

  const prompt = `Generate a ${config.totalQuestions}-question exam paper for ${fingerprint.examName}.

EXAM PATTERN (from analysis of ${fingerprint.papersAnalyzed} previous papers):

Subject Weightage:
${subjectWeightageTable}
— Generate EXACTLY this many questions per subject.

Difficulty Distribution:
- Easy: ${dd.easy}% (${easyCount} questions)
- Medium: ${dd.medium}% (${mediumCount} questions)
- Hard: ${dd.hard}% (${hardCount} questions)

Question Style Distribution:
${styleTable}
— Generate this proportion of each style.

Topic Priority (focus on these — they appear most frequently):
${topTopics}

Section Structure:
${sectionStructure}
— Follow this ordering in the paper.

Language Patterns to Follow:
- ${lp.negativeQuestionPercent.toFixed(0)}% questions should use "NOT" or "EXCEPT"
- ${lp.allOfAbovePercent.toFixed(0)}% should include "All of the above" as an option
- Use these phrasings: ${lp.commonPhrases.slice(0, 5).join(", ")}

${repeatCount > 0 ? `Include ${repeatCount} questions that are variations of frequently repeated questions (modify slightly, don't copy exactly).` : ""}
${currentAffairsCount > 0 ? `Include ${currentAffairsCount} current affairs questions relevant to the field.` : ""}

Total marks: ${fingerprint.structure.totalMarks}, with ${fingerprint.structure.negativeMarking ? fingerprint.structure.negativeScheme || "negative marking" : "no negative marking"}.
Arrange questions following the section structure above.

Return a JSON object with a "questions" array. Each question must have:
- question: string (the question text)
- options: string[] (exactly 4 options)
- answer: number (0-3, index of correct option)
- explanation: string (brief explanation of correct answer)
- subject: string
- topic: string
- style: string (one of the question styles listed above)
- difficulty: "easy" | "medium" | "hard"
- questionNumber: number (1 to ${config.totalQuestions})
- section: string (optional, the section name)
- isRepeatCandidate: boolean`;

  return { systemPrompt, prompt };
}
