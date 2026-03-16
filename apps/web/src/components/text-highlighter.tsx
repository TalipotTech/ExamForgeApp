"use client";

import { useMemo } from "react";

interface TextHighlighterProps {
  text: string;
  search: string;
}

/**
 * Wraps occurrences of `search` within `text` in <mark> tags.
 * Falls back to plain text when search is empty.
 */
export function TextHighlighter({ text, search }: TextHighlighterProps): React.ReactElement {
  const parts = useMemo(() => {
    if (!search.trim()) return [text];
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return text.split(regex);
  }, [text, search]);

  if (parts.length === 1) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
