"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownMessageProps {
  content: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 border-b-2 border-indigo-500 pb-1.5 text-xl font-bold text-indigo-700 dark:border-indigo-400 dark:text-indigo-300">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 border-b border-indigo-400/50 pb-1 text-lg font-semibold text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-4 text-base font-semibold text-purple-600 dark:text-purple-300">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-3 text-sm font-semibold text-teal-600 dark:text-teal-300">{children}</h4>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-indigo-50 dark:bg-indigo-950/40">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-slate-100 px-3 py-2 text-slate-700 dark:border-slate-800 dark:text-slate-300">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">{children}</tr>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-amber-400 bg-amber-50/60 py-2 pl-4 pr-3 italic text-slate-700 dark:border-amber-500 dark:bg-amber-950/30 dark:text-slate-300">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => <ul className="my-2 ml-1 list-none space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-1 list-decimal space-y-1 pl-4">{children}</ol>,
  li: ({ children }) => (
    <li className="relative pl-5 text-slate-700 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-indigo-400 before:content-[''] dark:text-slate-300 dark:before:bg-indigo-500">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-medium not-italic text-purple-600 dark:text-purple-400">{children}</em>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={`${className ?? ""} text-xs`}>{children}</code>;
    }
    return (
      <code className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-4 border-t-2 border-dashed border-slate-200 dark:border-slate-700" />,
  a: ({ children, href }) => (
    <a
      href={href}
      className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:decoration-indigo-600 dark:hover:text-indigo-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

export function MarkdownMessage({ content }: MarkdownMessageProps): React.ReactElement {
  return (
    <div className="max-w-none text-sm leading-relaxed text-slate-600 dark:text-slate-400">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
