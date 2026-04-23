"use client";

/**
 * Markdown renderer for creator content — styled port of PadVik's
 * renderer. Supports:
 *   - GFM (tables, strikethrough, task lists)
 *   - Math via KaTeX ($...$ and $$...$$)
 *   - Syntax-highlighted code blocks via rehype-highlight
 *   - Styled headings / lists / tables / blockquotes / inline code
 *   - Lazy-loaded images with border
 *
 * Drops PadVik's Mermaid block support — not needed for the current
 * educational content mix.
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
import { cn } from "@/lib/utils";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-foreground border-primary/20 mb-4 mt-8 border-b-2 pb-2 text-2xl font-bold tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-foreground border-border mb-3 mt-6 border-b pb-1.5 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-foreground mb-2 mt-5 text-lg font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-foreground mb-2 mt-4 text-base font-semibold">{children}</h4>
  ),
  p: ({ children }) => <p className="text-foreground my-3 leading-7">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-violet-500">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-violet-600">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-md border-l-4 border-violet-400 bg-violet-50/40 py-2 pl-4 pr-3 italic dark:border-violet-600 dark:bg-violet-950/20">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...rest }) => {
    const inline = !(className && className.startsWith("language-"));
    if (inline) {
      return (
        <code
          className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[0.85em] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={cn("font-mono text-sm", className)} {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-muted/60 border-border my-4 overflow-x-auto rounded-md border p-3 text-sm leading-relaxed">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-border my-6 border-t-2" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60 border-b">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-muted/30">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
  img: ({ src, alt }) => {
    if (!src) return null;
    const normalized = typeof src === "string" ? src : "";
    return (
      <img
        src={normalized}
        alt={alt ?? ""}
        className="border-border my-4 max-w-full rounded-md border shadow-sm"
        loading="lazy"
      />
    );
  },
  input: ({ type, checked, disabled }) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          readOnly
          className="mr-2 align-middle"
        />
      );
    }
    return null;
  },
};

export function MarkdownRenderer({
  content,
  className,
}: {
  content: string;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("examforge-markdown text-sm", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
