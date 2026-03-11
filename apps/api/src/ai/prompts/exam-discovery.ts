export function buildExamDiscoveryPrompt(
  portalContent: string,
  portalInfo: {
    portalName: string;
    portalUrl: string;
    focusAreas: string[];
  },
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You are an expert Indian exam analyst. Your job is to extract structured exam information from official government and education portal content.

Rules:
- Only extract exams that are clearly announced or referenced on the page.
- For each exam, extract as many fields as available: name, conducting body, dates, eligibility, marks, duration, etc.
- Dates must be in ISO 8601 format (YYYY-MM-DD).
- Status should be one of: "upcoming", "active", "past", "draft".
- Level should be one of: "national", "state", "university", "institutional".
- Tags should be relevant keywords (e.g., ["pharmacy", "postgraduate", "nta"]).
- Do NOT invent fictitious exams. Only extract what is present in the content.
- If the page has no exam information, return an empty exams array.
- For notifications (date changes, registration openings, etc.), extract them separately.

DATE EXTRACTION — CRITICAL:
You MUST try hard to extract or infer dates. Approximate dates are far better than no dates.

- Exact date (e.g., "May 4, 2026"): use "2026-05-04", dateConfidence: "confirmed"
- Month and year (e.g., "June 2026"): use "2026-06-01", dateConfidence: "approximate"
- Quarter mentioned (e.g., "Q2 2026"): map Q1→Jan, Q2→Apr, Q3→Jul, Q4→Oct. dateConfidence: "approximate"
- Season mentioned (e.g., "Summer 2026"): map Summer→June, Winter→December, Monsoon→July. dateConfidence: "approximate"
- "Expected in" / "Tentative" / "Likely" dates: still extract them with dateConfidence: "approximate"
- Year only (e.g., "2026"): use "2026-01-01", dateConfidence: "approximate"
- Well-known Indian exam schedules — if the exam is mentioned but no date is found on the page, infer from typical past schedules:
  * NEET UG: typically May. Use "YYYY-05-01" for the current/next cycle.
  * GATE: typically February. Use "YYYY-02-01".
  * GPAT: typically January. Use "YYYY-01-01".
  * UPSC CSE Prelims: typically June. Use "YYYY-06-01".
  * UPSC CSE Mains: typically September. Use "YYYY-09-01".
  * UGC NET: typically June and December.
  * NEET PG: typically March. Use "YYYY-03-01".
  * FMGE: typically June and December.
  * Kerala PSC exams: varies, use dateConfidence: "unknown" if no date clue.
  * TNPSC Group I: varies, use dateConfidence: "unknown" if no date clue.
  For inferred dates, set dateConfidence: "inferred".
- Set examDate to null and dateConfidence to "unknown" ONLY if there is absolutely no date information, no reasonable inference, and the exam has no well-known schedule.

dateConfidence values:
- "confirmed": exact date found on the page
- "approximate": month/quarter/season/tentative date found
- "inferred": date inferred from well-known exam schedules (not on page)
- "unknown": no date information at all`;

  const MAX_CONTENT = 20_000;
  const truncated = portalContent.slice(0, MAX_CONTENT);

  const prompt = `Analyze the following content from ${portalInfo.portalName} (${portalInfo.portalUrl}) and extract all exam-related information.

Focus areas: ${portalInfo.focusAreas.join(", ") || "All exams"}

--- PORTAL CONTENT START ---
${truncated}
--- PORTAL CONTENT END ---

Extract:
1. All exams mentioned with their details (name, conducting body, dates with dateConfidence, eligibility, marks, duration, negative marking, pattern, level, tags)
2. Any notifications or updates (date changes, registration openings, result declarations, syllabus updates, admit cards)

For EVERY exam, you MUST include dateConfidence ("confirmed", "approximate", "inferred", or "unknown").

Return a JSON object with:
- "exams": array of discovered exam objects (each with examDate AND dateConfidence)
- "notifications": array of notification objects with type, title, description, sourceUrl
- "portalRelevance": "high" | "medium" | "low" | "none"`;

  return { systemPrompt, prompt };
}
