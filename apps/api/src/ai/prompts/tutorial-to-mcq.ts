const MAX_TUTORIAL_LENGTH = 50_000;

export function buildMCQFromTutorialPrompt(params: {
  examName: string;
  tutorialTitle: string;
  tutorialContentText: string;
  count: number;
  difficultyMix: { easy: number; medium: number; hard: number };
}): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are an expert question setter for Indian competitive examinations. You generate high-quality MCQs from provided tutorial content. Every question must be directly answerable from the tutorial text.`;

  const truncatedContent = params.tutorialContentText.slice(0, MAX_TUTORIAL_LENGTH);

  const prompt = `Generate ${params.count} multiple-choice questions from the following tutorial.

Exam: ${params.examName}
Topic: ${params.tutorialTitle}
Difficulty distribution: ${params.difficultyMix.easy}% easy, ${params.difficultyMix.medium}% medium, ${params.difficultyMix.hard}% hard

=== TUTORIAL CONTENT ===
${truncatedContent}
=== END CONTENT ===

Rules:
1. EVERY question must be answerable from the tutorial content above
2. Questions should test understanding, not just recall
3. Each question has exactly 4 options (A, B, C, D)
4. Only ONE correct answer per question
5. Distractors must be plausible — commonly confused concepts
6. Explanation must reference specific content from the tutorial
7. Difficulty levels:
   - Easy: direct recall of definitions or facts from the tutorial
   - Medium: application of concepts, comparing related ideas
   - Hard: multi-step reasoning, clinical scenarios, combining concepts
8. Question types to include:
   - Standard MCQ (majority)
   - Assertion-Reason (if count > 10, include 2-3)
   - Match-the-following (if count > 15, include 1-2)
9. Cover different sections of the tutorial — don't cluster questions
10. Use standard exam language patterns for ${params.examName}

OUTPUT FORMAT: JSON array matching QuestionSchema[] (via Instructor.js)
Each question: { question, options, answer (0-3), explanation, subject, difficulty, type }`;

  return { systemPrompt, prompt };
}
