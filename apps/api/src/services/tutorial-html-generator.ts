import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Load template once at module level
const TEMPLATE_PATH = resolve(
  join(process.cwd(), "..", "web", "public", "templates", "tutorial-template.html"),
);

let templateCache: string | null = null;

function getTemplate(): string {
  if (!templateCache) {
    templateCache = readFileSync(TEMPLATE_PATH, "utf-8");
  }
  return templateCache;
}

export interface AssembleTutorialParams {
  fragment: string;
  title: string;
  subject: string;
  unitName: string;
  topicName: string;
  estimatedTime: number;
  difficulty: "Easy" | "Medium" | "Hard";
  progressPercent: number;
  prevTopicUrl: string;
  nextTopicUrl: string;
}

export function assembleTutorial(params: AssembleTutorialParams): string {
  let html = getTemplate();

  // 1. Extract objectives from the comment tag
  const objectivesMatch = params.fragment.match(/<!-- OBJECTIVES: (\[[\s\S]*?\]) -->/);
  let objectivesHtml = "";
  if (objectivesMatch) {
    try {
      const objectives: string[] = JSON.parse(objectivesMatch[1]!);
      objectivesHtml = objectives.map((o) => `          <li>${o}</li>`).join("\n");
    } catch {
      // If JSON parsing fails, skip objectives
    }
  }

  // 2. Extract section headings for TOC
  const headingRegex = /<h2 id="([^"]+)">([^<]+)<\/h2>/g;
  const tocEntries: { id: string; title: string }[] = [];
  let match;
  while ((match = headingRegex.exec(params.fragment)) !== null) {
    tocEntries.push({ id: match[1]!, title: match[2]! });
  }
  const tocHtml = tocEntries
    .map((e) => `        <li><a href="#${e.id}">${e.title}</a></li>`)
    .join("\n");

  // 3. Clean the fragment (remove the objectives comment)
  const cleanFragment = params.fragment.replace(/<!-- OBJECTIVES: \[[\s\S]*?\] -->/, "").trim();

  // 4. Replace all template placeholders
  html = html.replace(/\{\{TUTORIAL_TITLE\}\}/g, escapeHtml(params.title));
  html = html.replace(/\{\{SUBJECT\}\}/g, escapeHtml(params.subject));
  html = html.replace(/\{\{UNIT_NAME\}\}/g, escapeHtml(params.unitName));
  html = html.replace(/\{\{TOPIC_NAME\}\}/g, escapeHtml(params.topicName));
  html = html.replace(/\{\{ESTIMATED_TIME\}\}/g, String(params.estimatedTime));
  html = html.replace(/\{\{PROGRESS_PERCENT\}\}/g, String(params.progressPercent));
  html = html.replace(/\{\{PREV_TOPIC_URL\}\}/g, params.prevTopicUrl);
  html = html.replace(/\{\{NEXT_TOPIC_URL\}\}/g, params.nextTopicUrl);

  // 5. Replace difficulty badge
  const diffBadgeClass = `badge-${params.difficulty.toLowerCase()}`;
  html = html.replace(
    /<span class="badge badge-easy">Easy<\/span>\s*<!-- Use badge-easy.*?-->/,
    `<span class="badge ${diffBadgeClass}">${params.difficulty}</span>`,
  );

  // 6. Inject objectives
  if (objectivesHtml) {
    html = html.replace(
      /\{\{OBJECTIVE_1\}\}<\/li>\s*<li>\{\{OBJECTIVE_2\}\}<\/li>\s*<li>\{\{OBJECTIVE_3\}\}<\/li>/,
      objectivesHtml.replace(/^\s+/gm, ""),
    );
  }

  // 7. Inject tutorial content
  html = html.replace(
    /<!-- ── Section ── -->[\s\S]*?<\/div><!-- \/tutorial-content -->/,
    `${cleanFragment}\n      </div><!-- /tutorial-content -->`,
  );

  // 8. Inject TOC entries
  html = html.replace(
    /<li><a href="#section-1">1\. Introduction<\/a><\/li>[\s\S]*?<li><a href="#practice">Practice Questions<\/a><\/li>/,
    tocHtml + '\n        <li><a href="#practice">Practice Questions</a></li>',
  );

  return html;
}

export interface AssemblePreviewParams {
  fullHtml: string;
  previewPercentage: number;
}

export function assemblePreview(params: AssemblePreviewParams): string {
  const h2Regex = /<h2 id="[^"]*">/g;
  const h2Matches = [...params.fullHtml.matchAll(h2Regex)];
  const totalSections = h2Matches.length;
  const keepSections = Math.max(2, Math.ceil((totalSections * params.previewPercentage) / 100));

  if (keepSections >= totalSections || !h2Matches[keepSections]) {
    return params.fullHtml; // not enough sections to truncate
  }

  const cutoffIndex = h2Matches[keepSections]!.index!;
  const remaining = totalSections - keepSections;
  const beforeCutoff = params.fullHtml.substring(0, cutoffIndex);

  const previewBanner = `
        <div style="text-align:center; padding:3rem 1rem; margin-top:2rem; border-top:2px dashed var(--border);">
          <p style="font-size:2.5rem; margin-bottom:0.5rem;">&#128274;</p>
          <h3 style="font-size:1.1rem; font-weight:700; color:var(--foreground); border:none; padding:0; margin:0 0 0.4rem;">Continue reading with ExamForge Pro</h3>
          <p style="font-size:0.88rem; color:var(--muted-foreground); max-width:400px; margin:0 auto 1rem;">
            The full tutorial has ${remaining} more sections including worked examples,
            clinical applications, and practice questions.
          </p>
          <a href="/pricing" class="btn btn-primary" style="display:inline-flex;">
            Upgrade to Pro
          </a>
        </div>
      </div><!-- /tutorial-content -->`;

  // Find the closing tutorial-content tag and rebuild
  const closingTag = "</div><!-- /tutorial-content -->";
  const closingIndex = params.fullHtml.indexOf(closingTag);
  if (closingIndex === -1) {
    return params.fullHtml;
  }

  const afterContent = params.fullHtml.substring(closingIndex + closingTag.length);

  // Remove MCQ cards from preview
  const previewHtml = beforeCutoff + previewBanner + afterContent;

  return previewHtml;
}

// ─── Validation Helpers ───

export function validateHtmlFragment(fragment: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for required h2 sections
  const h2Count = (fragment.match(/<h2 /g) || []).length;
  if (h2Count < 2) {
    errors.push(`Expected at least 2 <h2> sections, found ${h2Count}`);
  }

  // Check h2 elements have id attributes
  const h2WithoutId = (fragment.match(/<h2 (?!id=)[^>]*>/g) || []).length;
  if (h2WithoutId > 0) {
    errors.push(`${h2WithoutId} <h2> elements missing id attribute`);
  }

  // Check for objectives comment
  if (!fragment.includes("<!-- OBJECTIVES:")) {
    errors.push("Missing <!-- OBJECTIVES: [...] --> comment");
  }

  // Check for unclosed tags (basic check)
  const openDivs = (fragment.match(/<div/g) || []).length;
  const closeDivs = (fragment.match(/<\/div>/g) || []).length;
  if (openDivs !== closeDivs) {
    errors.push(`Mismatched div tags: ${openDivs} opening, ${closeDivs} closing`);
  }

  return { valid: errors.length === 0, errors };
}

export function extractMetadataFromFragment(fragment: string): {
  sectionsCount: number;
  wordCount: number;
  estimatedReadMinutes: number;
  hasDiagrams: boolean;
  hasFormulas: boolean;
  hasTables: boolean;
  hasMnemonics: boolean;
  keyTerms: string[];
} {
  const sectionsCount = (fragment.match(/<h2 /g) || []).length;

  // Strip HTML tags for word count
  const textOnly = fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = textOnly.split(/\s+/).length;
  const estimatedReadMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const hasDiagrams = /<svg[\s>]/i.test(fragment);
  const hasFormulas = /class="formula"/.test(fragment);
  const hasTables = /<table[\s>]/i.test(fragment);
  const hasMnemonics = /memory aid/i.test(fragment) || /mnemonic/i.test(fragment);

  // Extract key terms from definition boxes
  const keyTerms: string[] = [];
  const defRegex = /<div class="definition">[\s\S]*?<strong>([^<]+)<\/strong>/g;
  let defMatch;
  while ((defMatch = defRegex.exec(fragment)) !== null) {
    keyTerms.push(defMatch[1]!.trim());
  }

  return {
    sectionsCount,
    wordCount,
    estimatedReadMinutes,
    hasDiagrams,
    hasFormulas,
    hasTables,
    hasMnemonics,
    keyTerms,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
