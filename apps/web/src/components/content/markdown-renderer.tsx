"use client";

/**
 * Markdown renderer for creator content — simplified port of PadVik's
 * MarkdownRenderer. Keeps GFM + math (KaTeX) support. Skips Mermaid +
 * code-highlighting for now (not needed for the MVP and keeps bundle small).
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-foreground mb-4 mt-8 border-b pb-2 text-2xl font-bold">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="text-foreground mb-3 mt-6 text-xl font-bold">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="text-foreground mb-2 mt-5 text-lg font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-foreground mb-2 mt-4 text-base font-semibold">{children}</h4>
  ),
  p: ({ children }) => <p className="text-foreground my-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="text-muted-foreground my-4 border-l-4 pl-4 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...rest }) => {
    const inline = !(className && className.startsWith("language-"));
    if (inline) {
      return (
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm" {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={cn("block font-mono text-sm", className)} {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-muted my-4 overflow-x-auto rounded-md p-3 text-sm">{children}</pre>
  ),
  hr: () => <hr className="my-6 border-t" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children }) => <th className="border px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border px-3 py-2">{children}</td>,
  img: ({ src, alt }) => {
    if (!src) return null;
    const normalized = typeof src === "string" ? src : "";
    return (
      <img
        src={normalized}
        alt={alt ?? ""}
        className="my-4 max-w-full rounded-md border"
        loading="lazy"
      />
    );
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
    <div className={cn("prose-sm max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
