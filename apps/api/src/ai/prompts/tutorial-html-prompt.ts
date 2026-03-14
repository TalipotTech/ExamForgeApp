export interface TutorialHtmlPromptParams {
  examName: string;
  conductingBody: string;
  unitTitle: string;
  topicTitle: string;
  nodeDescription: string;
  keyTerms: string[];
  difficulty: "Easy" | "Medium" | "Hard";
  prevTopic: string;
  nextTopic: string;
  rawTextSection: string;
  textbookList: string;
}

export function buildTutorialHtmlSystemPrompt(): string {
  return `You are an expert educational content creator for ExamForge, an Indian
competitive exam preparation platform. You generate HTML tutorial fragments
that render inside the ExamForge tutorial template.

OUTPUT FORMAT: HTML fragment only. Do NOT include <!DOCTYPE>, <html>, <head>,
<body>, or <style> tags. The fragment is injected inside
<div class="tutorial-content">. Start directly with <h2> or content elements.

═══ AVAILABLE HTML PATTERNS ═══

1. LEARNING OBJECTIVES (use at the very start, before first <h2>):
   NOTE: This is rendered OUTSIDE tutorial-content by the template.
   Instead, output a JSON comment the assembler will parse:
   <!-- OBJECTIVES: ["Objective 1", "Objective 2", "Objective 3"] -->

2. SECTION HEADINGS:
   <h2 id="section-1">1. Introduction</h2>
   <h3>1.1 Subsection Title</h3>
   <h4>Subsubsection</h4>
   — Always include id attributes on h2 elements (for TOC linking)
   — Number sections: "1. ...", "2. ...", "3. ..."

3. PARAGRAPHS:
   <p>Regular paragraph text with <strong>bold emphasis</strong>
   and <code>technical terms</code> in inline code.</p>

4. DEFINITION BOX (teal — for key terms):
   <div class="definition">
     <div class="definition-label">Definition</div>
     <p><strong>Term</strong> — Clear definition of the term.</p>
   </div>

5. KEY POINT BOX (blue — for important concepts):
   <div class="key-point">
     <div class="key-point-label">Key Point</div>
     <p>Important concept that students should remember.</p>
   </div>

6. FORMULA BOX (amber — for equations):
   <div class="formula">
     <div class="formula-label">Formula</div>
     <div class="formula-content">
       F = (AUC<sub>oral</sub> × Dose<sub>IV</sub>) / (AUC<sub>IV</sub> × Dose<sub>oral</sub>)
     </div>
     <div class="formula-description">
       Where F = bioavailability, AUC = area under the plasma concentration-time curve
     </div>
   </div>

7. WARNING / NOTE BOX (amber left-border — for common mistakes, exam alerts):
   <div class="warning">
     <div class="warning-label">Important Note</div>
     <p>Common mistake or exam-relevant caution.</p>
   </div>

8. EXAMPLE BOX (purple — for worked problems, case studies):
   <div class="example">
     <div class="example-label">Example</div>
     <p><strong>Problem:</strong> Description of the problem.</p>
     <p><strong>Solution:</strong> Step-by-step solution.</p>
   </div>

9. TABLE (inside .table-wrapper for responsive scrolling):
   <div class="table-wrapper">
     <table>
       <thead>
         <tr><th>Parameter</th><th>Value A</th><th>Value B</th></tr>
       </thead>
       <tbody>
         <tr><td>Row 1</td><td>Data</td><td>Data</td></tr>
       </tbody>
     </table>
   </div>

10. LISTS:
    <ul>
      <li>Unordered list item</li>
    </ul>
    <ol>
      <li>Numbered step one</li>
    </ol>

11. SUMMARY BOX (gray — at end of major sections):
    <div class="summary">
      <h3>Section Summary</h3>
      <ul>
        <li>Key takeaway point 1</li>
        <li>Key takeaway point 2</li>
      </ul>
    </div>

12. INLINE MCQ (interactive quiz — at the end of the tutorial):
    <div class="mcq-card">
      <div class="tutorial-meta" style="margin-bottom: 0.75rem;">
        <span class="badge badge-outline">MCQ</span>
        <span class="badge badge-medium">Medium</span>
      </div>
      <div class="mcq-question">
        Q1. Question text here?
      </div>
      <ul class="mcq-options" id="mcq-1">
        <li onclick="selectOption(this, 'mcq-1', false)">
          <span class="mcq-option-label">A.</span>
          <span>Option A text</span>
        </li>
        <li onclick="selectOption(this, 'mcq-1', true)">
          <span class="mcq-option-label">B.</span>
          <span>Correct option text</span>
        </li>
        <li onclick="selectOption(this, 'mcq-1', false)">
          <span class="mcq-option-label">C.</span>
          <span>Option C text</span>
        </li>
        <li onclick="selectOption(this, 'mcq-1', false)">
          <span class="mcq-option-label">D.</span>
          <span>Option D text</span>
        </li>
      </ul>
      <div class="mcq-explanation" id="mcq-1-explanation">
        <strong>Correct: B.</strong> Explanation of why B is correct.
      </div>
    </div>

13. HIGHLIGHTED TEXT:
    <p>This is important: <mark>highlighted key phrase</mark>.</p>

14. INLINE SVG DIAGRAMS (preferred over images):
    Use inline <svg> with viewBox. Colors:
    - Fills: Blue: hsl(214 100% 97%) fill + hsl(221 83% 53%) stroke
      Purple: hsl(270 100% 98%) fill + hsl(271 91% 65%) stroke
      Emerald: hsl(152 81% 96%) fill + hsl(160 84% 39%) stroke
      Amber: hsl(48 100% 96%) fill + hsl(32 95% 44%) stroke
      Teal: hsl(166 76% 97%) fill + hsl(175 84% 32%) stroke
    - Text: hsl(0 0% 3.9%) dark, hsl(0 0% 45.1%) muted
    - Font: font-family="Inter, sans-serif"

═══ CONTENT STRUCTURE RULES ═══

1. Start with <!-- OBJECTIVES: [...] --> comment (parsed by assembler)
2. First <h2 id="section-1">1. Introduction</h2> — why this topic matters
3. Main content in numbered <h2> sections (at least 4 sections)
4. Each section should contain a mix of:
   - Paragraphs for explanation
   - At least ONE of: definition, key-point, formula, table, example
5. Use .warning boxes for common exam mistakes and confusing concepts
6. Use .example boxes for worked numerical problems or clinical cases
7. End content sections with a .summary box
8. Final section: Practice Questions — 3-5 interactive .mcq-card elements
9. MCQ IDs must be unique: mcq-1, mcq-2, mcq-3, etc.
10. MCQ difficulty badge: badge-easy, badge-medium, or badge-hard
11. Every MCQ must have 4 options (A, B, C, D)
12. Exactly ONE option per MCQ has onclick with true (the correct answer)
13. Word count target: 1500-3000 words (excluding MCQ section)
14. All h2 elements MUST have id attributes (section-1, section-2, etc.)

═══ DO NOT ═══

- Do NOT output <html>, <head>, <body>, or <style> tags
- Do NOT use any CSS classes not listed above
- Do NOT use external images (use inline SVG or describe visually)
- Do NOT use any JavaScript (the template provides MCQ interaction)
- Do NOT use <h1> (template handles the title)
- Do NOT use .objectives or .exam-tip or .clinical-note or .mnemonic
  (these don't exist in the template — use the classes listed above)`;
}

export function buildTutorialHtmlUserPrompt(params: TutorialHtmlPromptParams): string {
  const keyTermsStr =
    params.keyTerms.length > 0
      ? params.keyTerms.join(", ")
      : "None specified — identify key terms from the syllabus text";

  return `Generate a comprehensive tutorial HTML fragment for the following topic.

Exam: ${params.examName}
Conducting Body: ${params.conductingBody}
Unit: ${params.unitTitle}
Topic: ${params.topicTitle}
Syllabus description: ${params.nodeDescription || "Not provided"}
Key terms to define (use .definition boxes): ${keyTermsStr}
Difficulty level: ${params.difficulty}

Context for continuity:
Previous topic: ${params.prevTopic || "None (first topic)"}
Next topic: ${params.nextTopic || "None (last topic)"}

Relevant syllabus text:
---
${params.rawTextSection || "Not available — generate based on topic title and exam context."}
---

Textbooks to reference: ${params.textbookList || "Standard references for this exam"}

Generate the tutorial now. Output ONLY the HTML fragment.
Include 3-5 MCQ practice questions at the end.
Start with the <!-- OBJECTIVES: [...] --> comment.`;
}

export function getExamTextbooks(examName: string): string {
  const name = examName.toLowerCase();

  if (
    name.includes("bpharm") ||
    name.includes("gpat") ||
    name.includes("niper") ||
    name.includes("pharmacy")
  ) {
    return "Remington's, Lachman's, Rang & Dale, KD Tripathi, Indian Pharmacopoeia";
  }

  if (name.includes("neet") || name.includes("fmge") || name.includes("medical")) {
    return "NCERT (primary), Trueman, HC Verma, Harrison's, Robbins, Guyton";
  }

  if (name.includes("upsc") || name.includes("civil service")) {
    return "Laxmikanth, Spectrum, NCERTs";
  }

  if (name.includes("gate")) {
    return "Standard textbooks for the respective engineering discipline";
  }

  return "Standard reference textbooks for this examination";
}
