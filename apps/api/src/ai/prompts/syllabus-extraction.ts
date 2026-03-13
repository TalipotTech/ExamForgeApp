const MAX_TEXT_LENGTH = 100_000;

export function buildSyllabusExtractionPrompt(
  examName: string,
  subjectName: string | undefined,
  rawText: string,
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are an expert academic curriculum analyst specializing in Indian university examination syllabi. You parse syllabus documents into precise hierarchical structures.`;

  const truncatedText = rawText.slice(0, MAX_TEXT_LENGTH);

  const prompt = `Parse the following exam syllabus text into a structured hierarchy.

Exam: ${examName}
${subjectName ? `Subject: ${subjectName}` : ""}

=== SYLLABUS TEXT ===
${truncatedText}
=== END TEXT ===

Rules:
1. Preserve the EXACT hierarchy as written in the syllabus
2. Every item must have a type:
   - "unit" — Major division (Unit I, Unit II, Module A, etc.)
   - "chapter" — Chapter or section within a unit
   - "topic" — Specific topic within a chapter
   - "subtopic" — Sub-point within a topic
   - "definition" — A specific term or concept to be defined
   - "formula" — Mathematical or chemical formula mentioned
   - "objective" — Learning objective or outcome listed
3. Extract ALL items — do not skip, summarize, or combine entries
4. For each item, extract:
   - title: the exact title/heading from the syllabus
   - description: any additional text/context provided
   - key_terms: technical terms mentioned (array of strings)
   - content: full text content if available (for definitions/formulas)
5. If hours, credits, or marks weightage are mentioned, include in description
6. Maintain sort_order based on appearance in document
7. Depth: 0=syllabus root, 1=unit, 2=chapter, 3=topic, 4=subtopic/definition

OUTPUT FORMAT: JSON matching SyllabusTreeSchema (provided via Instructor.js)
Do NOT include any text outside the JSON.`;

  return { systemPrompt, prompt };
}
