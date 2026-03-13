const MAX_CONTENT_LENGTH = 30_000;

export function buildPageStructureExtractionPrompt(
  pageContent: string,
  context: {
    portalName: string;
    pageType: string;
    url: string;
  },
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You extract structured exam information from Indian government PSC portal pages.
These pages contain HTML with tables or lists of exams. Links (<a href="...">) point to PDF documents.
You MUST extract the href attribute values from anchor tags — these are the PDF URLs.`;

  const truncated = pageContent.slice(0, MAX_CONTENT_LENGTH);

  const prompt = `Extract all exam entries from this portal page HTML.

Portal: ${context.portalName}
Page type: ${context.pageType}
URL: ${context.url}

=== PAGE HTML ===
${truncated}
=== END ===

For each exam entry, extract:
1. examName: the full exam/post name
2. examCategory: post category (e.g., "Assistant Professor", "Pharmacist Grade II")
3. examYear: year if mentioned (look for years like 2024, 2025 in text)
4. date: exam date if shown
5. pdfLinks: array of { url, label, type }
   - url: the href from <a> tags that link to PDFs (look for .pdf links or download links)
   - label: the visible text of the link (e.g., "Paper I", "Paper II", "Answer Key")
   - type: question_paper | answer_key | syllabus | notification | other
6. additionalInfo: any other relevant text (medium, subject, marks)

Rules:
- Extract EVERY entry, do not skip any
- PDF links are in <a href="..."> tags — extract the href value exactly as-is
- Some entries may have multiple PDFs (Paper I + Paper II + Answer Key)
- Kerala PSC uses Drupal CMS with table rows and link lists
- Kerala PSC often uses Sl.No numbered tables
- If page type is "examinations", entries are exam listings (may not have PDF links)
- If page type is "previous_questions", entries have question paper PDF links
- If no PDF links exist for an entry, still extract it with an empty pdfLinks array

Return results as { "entries": [...] }`;

  return { systemPrompt, prompt };
}

export function buildMCQExtractionFromPDFPrompt(
  rawText: string,
  context: {
    examName: string;
    year?: number;
    paperNumber?: string;
  },
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You extract MCQ questions from Indian competitive exam question papers.
These PDFs follow specific patterns: numbered questions with 4 options (A-D),
sometimes bilingual (English + Malayalam/Hindi), sometimes with diagrams described.`;

  const truncated = rawText.slice(0, MAX_CONTENT_LENGTH);

  const prompt = `Extract all MCQ questions from this question paper.

Exam: ${context.examName}
Year: ${context.year ?? "Unknown"}
Paper: ${context.paperNumber ?? "Single paper"}

=== PDF TEXT ===
${truncated}
=== END ===

Rules:
1. Extract EVERY question — do not skip any
2. Preserve the original question number
3. Each question: { questionNumber, question, options (4), answer: -1, subject, difficulty }
4. If bilingual: extract the English version only
5. If a question references an image/diagram: note "[Diagram: description]"
6. Classify each question's subject based on content
7. Difficulty: estimate based on concept complexity
8. Do NOT guess answers — set answer to -1 (answer keys are processed separately)

Return results as { "questions": [...] }`;

  return { systemPrompt, prompt };
}

export function buildAnswerKeyExtractionPrompt(
  rawText: string,
  context: {
    examName: string;
    year?: number;
    type: "omr" | "online";
  },
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You extract answer keys from Indian exam OMR/online answer key PDFs.
These typically contain: question number → correct option (A/B/C/D or 1/2/3/4).`;

  const truncated = rawText.slice(0, MAX_CONTENT_LENGTH);

  const prompt = `Extract the answer key from this document.

Exam: ${context.examName}
Year: ${context.year ?? "Unknown"}
Type: ${context.type}

=== PDF TEXT ===
${truncated}
=== END ===

Rules:
1. Extract EVERY question number → answer mapping
2. Answers may be: A/B/C/D, 1/2/3/4, or (A)/(B)/(C)/(D)
3. Normalize to 0-indexed: A/1 = 0, B/2 = 1, C/3 = 2, D/4 = 3
4. Some answer keys have multiple series (A, B, C, D booklet codes) — extract all series
5. If a question is "cancelled" or "bonus", note it with answer = -2

OUTPUT: JSON matching { series, answers: [{ questionNumber, answer }] }`;

  return { systemPrompt, prompt };
}

export function buildDescriptiveQuestionExtractionPrompt(
  rawText: string,
  context: {
    examName: string;
    year?: number;
  },
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `You extract descriptive (essay/written) exam questions from question paper PDFs.
These are NOT MCQ — they require written answers with specific marks per question.`;

  const truncated = rawText.slice(0, MAX_CONTENT_LENGTH);

  const prompt = `Extract all descriptive questions from this paper.

Exam: ${context.examName}
Year: ${context.year ?? "Unknown"}

=== PDF TEXT ===
${truncated}
=== END ===

For each question extract:
1. questionNumber: original number
2. question: full question text
3. marks: marks allocated
4. section: which section/part (if paper has parts)
5. type: essay | short_answer | problem | case_study
6. subject: classify the subject area
7. subQuestions: if the question has parts (a, b, c), extract each with { label, question, marks }

Return results as { "questions": [...] }`;

  return { systemPrompt, prompt };
}
