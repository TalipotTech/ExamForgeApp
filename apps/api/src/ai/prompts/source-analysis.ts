export function buildSourceAnalysisPrompt(
  pageContent: string,
  sourceUrl: string,
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are a web content analyst specializing in educational exam content. Your job is to analyze a web page and determine its value as a source for exam question extraction.

Rules:
- Assess whether the page contains exam-style questions (MCQs, True/False, etc.)
- Identify the subject areas and exam types covered
- Estimate the number of extractable questions
- Evaluate content quality and reliability
- Identify the best CSS selector for question containers if possible
- Determine optimal crawl configuration (depth, patterns, etc.)`;

  const MAX_CONTENT = 15_000;
  const truncated = pageContent.slice(0, MAX_CONTENT);

  const prompt = `Analyze the following web page and provide a detailed assessment of its value as a question source.

URL: ${sourceUrl}

--- PAGE CONTENT START ---
${truncated}
--- PAGE CONTENT END ---

Return a JSON object with:
- "isQuestionSource": boolean — does this page contain extractable exam questions?
- "estimatedQuestions": number — estimated count of extractable questions on this page
- "subjectsFound": string[] — subject areas identified
- "questionTypes": string[] — types of questions found (e.g., "mcq", "true_false")
- "contentQuality": "high" | "medium" | "low" — reliability of the content
- "suggestedSelector": string | null — CSS selector for the question container
- "suggestedDepth": number — recommended crawl depth (1-10)
- "suggestedPatterns": string[] — URL patterns to follow for more questions
- "notes": string — any additional observations about the source`;

  return { systemPrompt, prompt };
}
