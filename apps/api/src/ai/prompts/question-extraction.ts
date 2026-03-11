const MAX_CONTENT_LENGTH = 15_000;

export function buildQuestionExtractionPrompt(
  pageContent: string,
  examContext: {
    examName: string;
    subjects: string[];
    questionTypes: string[];
  },
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are an expert exam question extractor. Your job is to identify and extract exam-style questions from web page content.

Rules:
- Only extract questions that are clearly exam or quiz questions (MCQ, True/False, Fill-in-the-Blank, Match, Assertion-Reason).
- Each MCQ must have exactly 4 options.
- The answer index for MCQs is 0-based (0, 1, 2, or 3).
- Every question needs a clear, educational explanation (minimum 20 characters).
- Determine the subject and difficulty based on content complexity.
- If the page has no exam questions, return an empty questions array with pageRelevance: "none".
- Do NOT invent questions. Only extract what is explicitly present in the content.
- Fix obvious typos in questions but preserve the original meaning.
- For the subject field, use the most specific subject area (e.g., "Pharmacology" not "Pharmacy").
- For true_false questions, set answer to true or false (boolean).
- For fill_blank questions, set answer to the correct fill-in text.
- For match questions, provide at least 2 pairs with left and right fields.
- For assertion questions, use one of: both_true_reason_correct, both_true_reason_incorrect, assertion_true_reason_false, both_false.`;

  const truncatedContent = pageContent.slice(0, MAX_CONTENT_LENGTH);

  const prompt = `Extract all exam questions from the following web page content.

Exam context:
- Exam: ${examContext.examName}
- Expected subjects: ${examContext.subjects.join(", ") || "Any"}
- Question types to extract: ${examContext.questionTypes.join(", ") || "mcq, true_false, fill_blank, match, assertion"}

--- PAGE CONTENT START ---
${truncatedContent}
--- PAGE CONTENT END ---

Extract all valid exam questions from this content. Return a JSON object with a "questions" array and a "pageRelevance" field ("high", "medium", "low", or "none").`;

  return { systemPrompt, prompt };
}
