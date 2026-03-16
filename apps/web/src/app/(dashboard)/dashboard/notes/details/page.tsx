"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownMessage } from "@/components/markdown-message";
import { TextHighlighter } from "@/components/text-highlighter";
import { ScrollButtons } from "@/components/scroll-buttons";
import {
  StickyNote,
  Search,
  Clock,
  BookOpen,
  GraduationCap,
  FileText,
  Loader2,
  MessageCircleQuestion,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import "@/styles/tutorial-content.css";

const PAGE_SIZE = 50;

export default function NoteDetailsPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      }
    >
      <NoteDetailsContent />
    </Suspense>
  );
}

function NoteDetailsContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [allNotes, setAllNotes] = useState<NoteItem[]>([]);
  const [hasScrolledToHighlight, setHasScrolledToHighlight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  type NoteItem = {
    id: number;
    keyword: string | null;
    noteContent: string;
    noteHtml: string | null;
    isPublic: boolean | null;
    createdAt: string;
    syllabusNodeId: number;
    syllabusId: number;
    nodeTitle: string | null;
    syllabusName: string | null;
    examName: string | null;
  };

  // Debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string): void {
    setSearch(value);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
      setAllNotes([]);
    }, 300);
    setTimer(t);
  }

  const notesQuery = trpc.learn.getUserNotes.useQuery(
    {
      limit: PAGE_SIZE,
      offset,
      search: debouncedSearch || undefined,
    },
    { staleTime: 60_000 },
  );

  // Accumulate notes as pages load
  useEffect(() => {
    if (notesQuery.data) {
      if (offset === 0) {
        setAllNotes(notesQuery.data as NoteItem[]);
      } else {
        setAllNotes((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newNotes = (notesQuery.data as NoteItem[]).filter((n) => !existingIds.has(n.id));
          return [...prev, ...newNotes];
        });
      }
    }
  }, [notesQuery.data, offset]);

  // Scroll to highlighted note
  useEffect(() => {
    if (highlightId && allNotes.length > 0 && !hasScrolledToHighlight) {
      const el = document.getElementById(`note-${highlightId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-primary", "ring-offset-2");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
          }, 3000);
        }, 100);
        setHasScrolledToHighlight(true);
      }
    }
  }, [highlightId, allNotes, hasScrolledToHighlight]);

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const hasMore = notesQuery.data?.length === PAGE_SIZE;

  // Strip [[suggest: ...]] markers from content for display
  function cleanContent(content: string | null): string {
    if (!content) return "";
    return content.replace(/\[\[suggest:\s*.+?\]\]/g, "").trim();
  }

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/notes">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <StickyNote className="h-6 w-6 text-amber-500" />
                Note Details
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Full view of all your saved notes
              </p>
            </div>
          </div>
        </div>
        {allNotes.length > 0 && <Badge variant="secondary">{allNotes.length} notes</Badge>}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search notes — matches are highlighted..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Notes */}
      {notesQuery.isLoading && offset === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : allNotes.length === 0 ? (
        <div className="py-16 text-center">
          <StickyNote className="text-muted-foreground/30 mx-auto h-12 w-12" />
          <h3 className="mt-4 text-lg font-medium">No notes found</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {debouncedSearch
              ? `No notes matching "${debouncedSearch}"`
              : "Save notes from AI chat conversations while learning"}
          </p>
          {!debouncedSearch && (
            <Link href="/learn">
              <Button variant="outline" className="mt-4 gap-1">
                <BookOpen className="h-4 w-4" />
                Browse Tutorials
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {allNotes.map((note) => {
            const content = cleanContent(note.noteContent);

            return (
              <Card key={note.id} id={`note-${note.id}`} className="transition-all duration-300">
                <CardContent className="p-0">
                  {/* Note header */}
                  {note.keyword ? (
                    <div className="flex items-start gap-2 rounded-t-lg border-b bg-blue-50 px-5 py-3 dark:bg-blue-900/20">
                      <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Q:
                        </span>{" "}
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          {debouncedSearch ? (
                            <TextHighlighter text={note.keyword} search={debouncedSearch} />
                          ) : (
                            note.keyword
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-t-lg border-b px-5 py-3">
                      <span className="text-sm font-medium">Note</span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="px-5 py-4">
                    {debouncedSearch && content ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <TextHighlighter text={content} search={debouncedSearch} />
                      </div>
                    ) : note.noteHtml ? (
                      <article
                        className="tutorial-reader"
                        dangerouslySetInnerHTML={{ __html: note.noteHtml }}
                      />
                    ) : (
                      <MarkdownMessage content={content} />
                    )}
                  </div>

                  {/* Footer: meta + actions */}
                  <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {note.examName && (
                        <Badge variant="outline" className="gap-0.5 text-[10px]">
                          <GraduationCap className="h-2.5 w-2.5" />
                          {note.examName}
                        </Badge>
                      )}
                      {note.syllabusName && (
                        <Badge variant="outline" className="gap-0.5 text-[10px]">
                          <BookOpen className="h-2.5 w-2.5" />
                          {note.syllabusName}
                        </Badge>
                      )}
                      {note.nodeTitle && (
                        <Badge variant="secondary" className="gap-0.5 text-[10px]">
                          <FileText className="h-2.5 w-2.5" />
                          {note.nodeTitle}
                        </Badge>
                      )}
                      <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(note.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {note.syllabusId && (
                      <Link href={`/learn/${note.syllabusId}?node=${note.syllabusNodeId}` as "/"}>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          <ExternalLink className="h-3 w-3" />
                          Go to Tutorial
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={notesQuery.isFetching}
                className="gap-1"
              >
                {notesQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Load More Notes"
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <ScrollButtons containerRef={containerRef} />
    </div>
  );
}
