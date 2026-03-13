export function buildQueryParserPrompt(userQuery: string): {
  systemPrompt: string;
  prompt: string;
} {
  const systemPrompt = `You parse natural language search queries about Indian competitive exams into structured search parameters.

Normalize exam names to standard forms:
NEET UG, NEET PG, GPAT, UPSC CSE, Kerala PSC, TNPSC, GATE, UGC NET, FMGE, AIIMS, JIPMER, RGUHS, KPSC, APPSC, TSPSC, SSC CGL, SSC CHSL, IBPS PO, RRB NTPC.

Detect intent: are they looking for previous questions, syllabus, mock tests, study material, answer keys, or notifications?
Extract year if mentioned. Identify subject if specified.
Return JSON matching the schema provided.`;

  const prompt = `Parse this search query: "${userQuery}"

Extract:
1. intent: previous_questions | syllabus | mock_test | study_material | answer_key | notification | general
2. examName: exact standardized exam name (null if unclear)
3. examYear: specific year mentioned (null if not specified)
4. subject: specific subject (null if whole exam)
5. contentFormat: pdf | web | any (based on user preference or "any" if not specified)
6. keywords: additional search terms not covered above (array)
7. specificSource: if user mentions a source like "from NTA", "official", "testbook" (null otherwise)

OUTPUT: JSON matching ParsedQuerySchema`;

  return { systemPrompt, prompt };
}
