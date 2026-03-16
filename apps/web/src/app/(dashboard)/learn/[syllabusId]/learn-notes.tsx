"use client";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownMessage } from "@/components/markdown-message";
import { StickyNote, User, Globe, Clock, MessageCircleQuestion } from "lucide-react";

interface LearnNotesProps {
  syllabusNodeId: number;
}

/**
 * Strip [[suggest: ...]] markers from content and return them separately.
 */
function extractSuggestions(content: string): {
  cleanContent: string;
  suggestions: string[];
} {
  const regex = /\[\[suggest:\s*(.+?)\]\]/g;
  const suggestions: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    suggestions.push(match[1]!);
  }
  const cleanContent = content.replace(regex, "").trim();
  return { cleanContent, suggestions };
}

export function LearnNotes({ syllabusNodeId }: LearnNotesProps): React.ReactElement | null {
  const notesQuery = trpc.learn.getNotesForNode.useQuery(
    { syllabusNodeId },
    { staleTime: 2 * 60 * 1000 },
  );

  const notes = notesQuery.data ?? [];

  if (notes.length === 0) return null;

  return (
    <div className="mt-8 border-t pt-6">
      <div className="mb-4 flex items-center gap-2">
        <StickyNote className="h-5 w-5 text-amber-500" />
        <h3 className="text-lg font-semibold">Notes</h3>
        <Badge variant="secondary" className="text-xs">
          {notes.length}
        </Badge>
      </div>

      <div className="space-y-3">
        {notes.map((note) => {
          const { cleanContent, suggestions } = extractSuggestions(note.noteContent ?? "");

          return (
            <Card key={note.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Header: ownership + date */}
                <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
                  {note.isOwn ? (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Your note
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Community note
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(note.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* User question (keyword) — highlighted */}
                {note.keyword && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                    <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">Q:</span> {note.keyword}
                    </span>
                  </div>
                )}

                {/* Note content — always rendered as markdown */}
                <MarkdownMessage content={cleanContent} />

                {/* AI suggested prompts — styled as non-clickable badges */}
                {suggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2">
                    {suggestions.map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
