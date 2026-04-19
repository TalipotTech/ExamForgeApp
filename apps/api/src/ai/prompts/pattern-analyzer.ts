type PaperAnalysisInput = {
  year: number;
  paperNumber?: string;
  totalQuestions: number;
  subjectDistribution: Record<string, number>;
  topicDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  styleDistribution: Record<string, number>;
  repeatedQuestions: number;
};

type ExamContext = {
  examId: string;
  examName: string;
  conductingBody: string;
  totalMarks?: number;
  durationMinutes?: number;
  negativeMarking?: boolean;
  negativeMarkingScheme?: string;
};

export function buildPatternAnalyzerPrompt(
  papers: PaperAnalysisInput[],
  context: ExamContext,
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are an exam pattern analyst. Given multiple years of classified question papers for the same exam, you identify patterns, trends, and generate a comprehensive exam fingerprint.
You are analytical, precise, and base all conclusions on the data provided.`;

  const papersJson = JSON.stringify(papers, null, 2);

  const prompt = `Analyze the following ${papers.length} question papers for ${context.examName} (${context.conductingBody}) and generate a comprehensive exam pattern fingerprint.

Papers data:
${papersJson}

Exam metadata:
- Total marks: ${context.totalMarks ?? "unknown"}
- Duration: ${context.durationMinutes ?? "unknown"} minutes
- Negative marking: ${context.negativeMarking ? "Yes" : "No"}
${context.negativeMarkingScheme ? `- Scheme: ${context.negativeMarkingScheme}` : ""}

Analyze and report:

1. SUBJECT WEIGHTAGE: Average % per subject across all papers. Include min/max range to show consistency.

2. TOPIC FREQUENCY: For each subject, which topics appear in how many papers? Rank by frequency. Mark "must_study" if >80% of papers, "high" if >60%, "medium" if >40%, "low" otherwise.

3. DIFFICULTY DISTRIBUTION: Overall easy/medium/hard split as percentages. Is it consistent or trending harder/easier?

4. QUESTION STYLE DISTRIBUTION: What % are each style type?

5. SECTION STRUCTURE: Is there a predictable order? (e.g., first 20 = GK, 21-60 = Subject Core)

6. REPEAT ANALYSIS: What % of questions are near-repeats of previous years? Which topics have the most repeats?

7. LANGUAGE PATTERNS: % of negative questions, "All of the above" frequency, common question phrasings.

Return a JSON object matching ExamFingerprint schema with these fields:
- examId: "${context.examId}"
- examName: "${context.examName}"
- conductingBody: "${context.conductingBody}"
- papersAnalyzed: ${papers.length}
- confidence: number 0-1 (higher with more papers)
- structure: { totalQuestions, totalMarks, durationMinutes, negativeMarking, negativeScheme, sections: [{ name, questionRange: [start, end], subjectFocus }] }
- subjectWeightage: [{ subject, averagePercent, minPercent, maxPercent, questionCount }]
- topicFrequency: [{ subject, topic, appearsInPercent, avgQuestionsPerPaper, importance }]
- difficultyDistribution: { easy, medium, hard } (percentages)
- styleDistribution: [{ style, percent }]
- repeatAnalysis: { overallRepeatRate, topRepeatedTopics, commonRepeatedQuestions: [{ question, appearedIn }] }
- languagePatterns: { negativeQuestionPercent, allOfAbovePercent, noneOfAbovePercent, commonPhrases }
- generatedAt: ISO date string
- paperYearsIncluded: [${papers.map((p) => p.year).join(", ")}]`;

  return { systemPrompt, prompt };
}
