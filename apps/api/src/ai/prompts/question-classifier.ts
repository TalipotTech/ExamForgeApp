type QuestionForClassification = {
  questionId: string;
  questionNumber?: number;
  question: string;
  options: string[];
  answer?: number;
  subject?: string;
  topic?: string;
};

type ExamContext = {
  examName: string;
  conductingBody: string;
  year: number;
  paperNumber?: string;
};

export function buildQuestionClassifierPrompt(
  questions: QuestionForClassification[],
  context: ExamContext,
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are an exam pattern analyst for Indian competitive examinations.
You classify questions by subject, topic, subtopic, difficulty, and question style.
You are precise and consistent in your classifications.`;

  const questionsJson = JSON.stringify(
    questions.map((q) => ({
      questionId: q.questionId,
      questionNumber: q.questionNumber,
      question: q.question,
      options: q.options,
      answer: q.answer,
      existingSubject: q.subject,
      existingTopic: q.topic,
    })),
    null,
    2,
  );

  const prompt = `Classify each question from this exam paper.

Exam: ${context.examName} (${context.conductingBody})
Year: ${context.year}
${context.paperNumber ? `Paper: ${context.paperNumber}` : ""}

For each question, provide:
1. analyzedSubject: main subject area (e.g., "Pharmacology", "Pharmaceutics", "Pharmaceutical Chemistry", "Pharmacognosy", "General Knowledge")
2. analyzedTopic: specific topic (e.g., "Drug Metabolism", "Tablet Coating", "Alkaloids")
3. analyzedSubtopic: narrower focus if applicable (e.g., "Phase I reactions", "Film coating")
4. analyzedStyle: one of:
   - "direct_recall" — "What is the mechanism of action of X?"
   - "choose_correct" — "Which of the following is correct?"
   - "choose_incorrect" — "Which is NOT correct?" / "All EXCEPT"
   - "match_following" — "Match Column A with Column B"
   - "assertion_reason" — "Assertion: X. Reason: Y."
   - "clinical_case" — "A 45-year-old patient presents with..."
   - "calculation" — "Calculate the dose if..."
   - "classification" — "Drug X belongs to which class?"
   - "sequence_order" — "Arrange in order of..."
   - "fill_blank" — "_____ is the drug of choice for..."
   - "image_based" — Based on a diagram/structure
   - "current_affairs" — Recent event/discovery/regulation
   - "definition" — "Which statement defines X?"
   - "comparison" — "Difference between X and Y"
   - "true_false_combo" — "Statements: 1. X 2. Y. Which are true?"
5. difficulty: easy | medium | hard
   - easy: direct recall, single fact
   - medium: requires understanding, application, or comparison
   - hard: multi-step reasoning, clinical scenario, calculation
6. patternTags: array of relevant tags:
   - "frequently_tested" — this exact topic appears in many papers
   - "trap_question" — uses confusing distractors
   - "negative_question" — asks "NOT" or "EXCEPT"
   - "all_of_above" — includes "All of the above" option
   - "current_affairs" — time-dependent question
   - "image_based" — references a diagram
   - "calculation" — requires math

Questions:
${questionsJson}

Return a JSON object with a "questions" array. Each element must have: questionId, analyzedSubject, analyzedTopic, analyzedSubtopic (optional string), analyzedStyle, difficulty, patternTags.`;

  return { systemPrompt, prompt };
}
