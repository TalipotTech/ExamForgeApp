/**
 * Minimal HTML → Markdown converter — Universal Discovery Agent v2
 *
 * We can't install a heavyweight dependency like turndown just for this,
 * and the AI only needs enough structure to reason over: headings,
 * links, lists, tables, paragraphs. This converter is intentionally
 * simple — it strips scripts/styles, unwraps layout div hell, and emits
 * markdown-flavoured text that keeps URLs intact.
 *
 * Built on cheerio (already a direct dep via Crawlee).
 */

import * as cheerio from "cheerio";

// Cheerio v1.2 no longer re-exports Element, and `domhandler` isn't
// directly resolvable under pnpm strict hoisting. This is the minimum
// shape we need from the tree nodes — enough to narrow by `type` and
// access `tagName` on element nodes.
type CheerioNode =
  | { type: "text"; data?: string }
  | { type: "tag"; tagName: string }
  | { type: string; tagName?: string };

interface ConvertOptions {
  baseUrl?: string;
  /** Cap on output length — truncation is noted inline. */
  maxChars?: number;
}

/**
 * Resolve a possibly-relative URL against a base.
 * Returns the original on any parsing error (keeps the AI informed).
 */
function resolveUrl(href: string, baseUrl?: string): string {
  if (!href) return "";
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/**
 * Convert an HTML document to a markdown-ish representation suitable for
 * AI page parsing. Preserves anchor URLs, headings, tables, lists, and PDF
 * file links. Strips navigation, scripts, styles, and noisy wrappers.
 */
export function htmlToMarkdown(html: string, opts: ConvertOptions = {}): string {
  if (!html) return "";

  const $ = cheerio.load(html);
  const { baseUrl, maxChars = 30_000 } = opts;

  // Strip the obvious noise.
  $("script, style, noscript, iframe, svg, link, meta").remove();
  $("header nav, footer nav, [role=navigation]").remove();
  $("[aria-hidden=true]").remove();

  const chunks: string[] = [];

  const walk = (node: CheerioNode): void => {
    if (node.type === "text") {
      // Cheerio accepts any node object for $(...); the casts are narrow
      // and local — runtime checks already discriminated by `type`.
      const text = $(node as unknown as Parameters<typeof $>[0])
        .text()
        .replace(/\s+/g, " ");
      if (text.trim()) chunks.push(text);
      return;
    }
    if (node.type !== "tag" || !node.tagName) return;

    const tag = node.tagName.toLowerCase();
    const $el = $(node as unknown as Parameters<typeof $>[0]);

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tag[1]);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) chunks.push(`\n\n${"#".repeat(level)} ${text}\n\n`);
        return;
      }
      case "p":
      case "div":
      case "section":
      case "article": {
        chunks.push("\n");
        $el.contents().each((_, c) => walk(c));
        chunks.push("\n");
        return;
      }
      case "br": {
        chunks.push("\n");
        return;
      }
      case "hr": {
        chunks.push("\n---\n");
        return;
      }
      case "a": {
        const href = resolveUrl(($el.attr("href") || "").trim(), baseUrl);
        const label = $el.text().replace(/\s+/g, " ").trim();
        if (!href) {
          if (label) chunks.push(label);
          return;
        }
        // Markdown inline link, with PDF annotation so the AI can tell.
        const isPdf = /\.pdf(\?|$)/i.test(href);
        const tag = isPdf ? " [PDF]" : "";
        chunks.push(`[${label || href}](${href})${tag}`);
        return;
      }
      case "ul":
      case "ol": {
        chunks.push("\n");
        $el.children("li").each((idx, li) => {
          const bullet = tag === "ol" ? `${idx + 1}.` : "-";
          chunks.push(`${bullet} `);
          $(li)
            .contents()
            .each((_, c) => walk(c));
          chunks.push("\n");
        });
        chunks.push("\n");
        return;
      }
      case "table": {
        // Render as pipe-table markdown. Handles header row if <thead> exists.
        const rows: string[][] = [];
        $el.find("tr").each((_, tr) => {
          const cells: string[] = [];
          $(tr)
            .find("th, td")
            .each((_, cell) => {
              // Preserve link URLs inside cells.
              const $cell = $(cell);
              const parts: string[] = [];
              $cell.contents().each((_, c) => {
                if (c.type === "text") {
                  parts.push($(c).text().replace(/\s+/g, " "));
                } else if (c.type === "tag" && c.tagName.toLowerCase() === "a") {
                  const href = resolveUrl(($(c).attr("href") || "").trim(), baseUrl);
                  const label = $(c).text().replace(/\s+/g, " ").trim();
                  if (href) {
                    const isPdf = /\.pdf(\?|$)/i.test(href);
                    parts.push(`[${label || href}](${href})${isPdf ? " [PDF]" : ""}`);
                  } else if (label) {
                    parts.push(label);
                  }
                } else if (c.type === "tag") {
                  parts.push($(c).text().replace(/\s+/g, " "));
                }
              });
              cells.push(parts.join(" ").replace(/\|/g, "\\|").trim());
            });
          if (cells.length) rows.push(cells);
        });

        if (rows.length) {
          chunks.push("\n\n");
          const width = Math.max(...rows.map((r) => r.length));
          const pad = (r: string[]): string[] =>
            r.concat(Array(Math.max(0, width - r.length)).fill(""));
          const [first, ...rest] = rows;
          chunks.push(`| ${pad(first ?? []).join(" | ")} |\n`);
          chunks.push(`| ${Array(width).fill("---").join(" | ")} |\n`);
          for (const r of rest) {
            chunks.push(`| ${pad(r).join(" | ")} |\n`);
          }
          chunks.push("\n");
        }
        return;
      }
      case "thead":
      case "tbody":
      case "tr":
      case "td":
      case "th":
        // Handled by the table case above — skip recursion here.
        return;
      case "strong":
      case "b": {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) chunks.push(`**${text}**`);
        return;
      }
      case "em":
      case "i": {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) chunks.push(`*${text}*`);
        return;
      }
      case "img": {
        const alt = ($el.attr("alt") || "").trim();
        const src = resolveUrl(($el.attr("src") || "").trim(), baseUrl);
        if (src) chunks.push(`![${alt}](${src})`);
        return;
      }
      default: {
        // Generic fallthrough — recurse into children.
        $el.contents().each((_, c) => walk(c));
      }
    }
  };

  $("body")
    .contents()
    .each((_, c) => walk(c));

  // Normalize whitespace: collapse >2 blank lines and excess spaces.
  let md = chunks
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (md.length > maxChars) {
    md = `${md.slice(0, maxChars)}\n\n[... truncated ${md.length - maxChars} chars ...]`;
  }

  return md;
}
