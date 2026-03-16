"use client";

import { useMemo } from "react";
import { MarkdownMessage } from "@/components/markdown-message";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface ChatMessageWithPromptsProps {
  content: string;
  onPromptClick?: (prompt: string) => void;
}

/**
 * Renders an AI chat message with markdown formatting.
 * Detects [[suggest: ...]] patterns and renders them as clickable prompt chips.
 */
export function ChatMessageWithPrompts({
  content,
  onPromptClick,
}: ChatMessageWithPromptsProps): React.ReactElement {
  const { cleanContent, suggestions } = useMemo(() => {
    const regex = /\[\[suggest:\s*(.+?)\]\]/g;
    const found: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      found.push(match[1]!);
    }
    const clean = content.replace(regex, "").trim();
    return { cleanContent: clean, suggestions: found };
  }, [content]);

  return (
    <div>
      <MarkdownMessage content={cleanContent} />

      {suggestions.length > 0 && (
        <div className="border-border/50 mt-2 border-t pt-2">
          <div className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px] font-medium">
            <Sparkles className="h-2.5 w-2.5" />
            Try asking:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="border-primary/20 bg-primary/5 hover:bg-primary/10 h-auto whitespace-normal rounded-full px-2.5 py-1 text-left text-[11px] leading-tight"
                onClick={(e) => {
                  e.stopPropagation();
                  onPromptClick?.(suggestion);
                }}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
