import type { TutorialFileSection } from "@examforge/shared/db/schema";

/**
 * Parses assembled tutorial HTML into structured sections.
 * Splits on <h2 id="..."> boundaries within the .tutorial-content div.
 */
export function parseHtmlToSections(html: string): {
  sections: TutorialFileSection[];
  plainText: string;
} {
  // Extract the tutorial-content div body
  const contentStart = html.indexOf('<div class="tutorial-content">');
  const contentEnd = html.indexOf("</div><!-- /tutorial-content -->");

  const content =
    contentStart !== -1 && contentEnd !== -1
      ? html.substring(contentStart + '<div class="tutorial-content">'.length, contentEnd)
      : html;

  // Split on <h2 id="..."> boundaries
  const h2Regex = /<h2\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g;
  const matches: Array<{ id: string; title: string; index: number; fullMatchLength: number }> = [];
  let match;

  while ((match = h2Regex.exec(content)) !== null) {
    matches.push({
      id: match[1]!,
      title: stripHtml(match[2]!).trim(),
      index: match.index,
      fullMatchLength: match[0].length,
    });
  }

  const sections: TutorialFileSection[] = [];

  if (matches.length === 0) {
    // No h2 headings — treat entire content as single section
    const plain = stripHtml(content).trim();
    if (plain.length > 0) {
      sections.push({
        id: "main",
        title: "Content",
        htmlContent: content.trim(),
        plainText: plain,
        order: 0,
      });
    }
  } else {
    // Content before first h2 (e.g., intro paragraph)
    const preContent = content.substring(0, matches[0]!.index).trim();
    if (preContent.length > 0 && stripHtml(preContent).trim().length > 20) {
      sections.push({
        id: "intro",
        title: "Introduction",
        htmlContent: preContent,
        plainText: stripHtml(preContent).trim(),
        order: 0,
      });
    }

    // Each h2 section
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i]!;
      const next = matches[i + 1];

      const sectionStart = current.index;
      const sectionEnd = next ? next.index : content.length;
      const htmlContent = content.substring(sectionStart, sectionEnd).trim();
      const plainText = stripHtml(htmlContent).trim();

      sections.push({
        id: current.id,
        title: current.title,
        htmlContent,
        plainText,
        order: sections.length,
      });
    }
  }

  // Build full plain text
  const plainText = sections.map((s) => `${s.title}\n${s.plainText}`).join("\n\n");

  return { sections, plainText };
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
