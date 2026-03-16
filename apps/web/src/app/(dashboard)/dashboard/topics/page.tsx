"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarkdownMessage } from "@/components/markdown-message";
import { TextHighlighter } from "@/components/text-highlighter";
import { ScrollButtons } from "@/components/scroll-buttons";
import { GenerateExamDialog } from "../../learn/[syllabusId]/generate-exam-dialog";
import {
  BookMarked,
  Search,
  Clock,
  BookOpen,
  GraduationCap,
  Loader2,
  ExternalLink,
  StickyNote,
  CheckCircle2,
  FileText,
  MessageCircleQuestion,
  Sparkles,
  X,
  CheckSquare,
} from "lucide-react";
import "@/styles/tutorial-content.css";

const PAGE_SIZE = 10;

type TutorialSection = {
  id: string;
  title: string;
  htmlContent: string;
  plainText: string;
  order: number;
};

type TopicItem = {
  nodeId: number;
  nodeTitle: string;
  syllabusId: number;
  syllabusName: string;
  examName: string | null;
  completionPercent: number;
  lastReadAt: string;
  tutorialFileId: number;
  sections: TutorialSection[] | null;
  plainText: string | null;
  wordCount: number | null;
  estimatedReadMinutes: number | null;
  sectionsCount: number | null;
};

export default function TopicDetailsPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [allTopics, setAllTopics] = useState<TopicItem[]>([]);
  const [notesDialogNodeId, setNotesDialogNodeId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection for exam generation
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [examDialogOpen, setExamDialogOpen] = useState(false);

  // Debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string): void {
    setSearch(value);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
      setAllTopics([]);
    }, 300);
    setTimer(t);
  }

  const topicsQuery = trpc.learn.getUserTopicsWithContent.useQuery(
    {
      limit: PAGE_SIZE,
      offset,
      search: debouncedSearch || undefined,
    },
    { staleTime: 60_000 },
  );

  // Accumulate topics as pages load
  useEffect(() => {
    if (topicsQuery.data) {
      if (offset === 0) {
        setAllTopics(topicsQuery.data as TopicItem[]);
      } else {
        setAllTopics((prev) => {
          const existingIds = new Set(prev.map((t) => t.nodeId));
          const newTopics = (topicsQuery.data as TopicItem[]).filter(
            (t) => !existingIds.has(t.nodeId),
          );
          return [...prev, ...newTopics];
        });
      }
    }
  }, [topicsQuery.data, offset]);

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const hasMore = topicsQuery.data?.length === PAGE_SIZE;

  // Notes dialog
  const notesQuery = trpc.learn.getNotesForNode.useQuery(
    { syllabusNodeId: notesDialogNodeId! },
    { enabled: !!notesDialogNodeId },
  );

  // Selection helpers
  function toggleTopicSelection(nodeId: number): void {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function clearSelection(): void {
    setSelectedTopics(new Set());
    setSelectionMode(false);
  }

  // Get syllabusId from first selected topic (multi-topic exam requires same syllabus)
  const selectedSyllabusInfo = useMemo(() => {
    if (selectedTopics.size === 0) return null;
    const selected = allTopics.filter((t) => selectedTopics.has(t.nodeId));
    const syllabusIds = new Set(selected.map((t) => t.syllabusId));
    if (syllabusIds.size === 1) {
      return { syllabusId: selected[0]!.syllabusId, sameSyllabus: true };
    }
    return { syllabusId: selected[0]!.syllabusId, sameSyllabus: false };
  }, [selectedTopics, allTopics]);

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookMarked className="text-primary h-6 w-6" />
            My Topics
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Topics you&apos;ve been studying with full tutorial content
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allTopics.length > 0 && (
            <>
              <Badge variant="secondary">{allTopics.length} topics</Badge>
              <Button
                variant={selectionMode ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => {
                  if (selectionMode) {
                    clearSelection();
                  } else {
                    setSelectionMode(true);
                  }
                }}
              >
                {selectionMode ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3.5 w-3.5" />
                    Select Topics
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Selection bar */}
      {selectionMode && selectedTopics.size > 0 && (
        <div className="bg-primary/5 sticky top-14 z-20 flex items-center justify-between rounded-lg border px-4 py-3 shadow-sm">
          <span className="text-sm font-medium">
            {selectedTopics.size} topic{selectedTopics.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            {selectedSyllabusInfo && !selectedSyllabusInfo.sameSyllabus && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Select topics from the same syllabus to generate an exam
              </span>
            )}
            <Button
              size="sm"
              className="gap-1"
              disabled={!selectedSyllabusInfo?.sameSyllabus}
              onClick={() => setExamDialogOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Exam
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search topics — matches are highlighted..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Topics */}
      {topicsQuery.isLoading && offset === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : allTopics.length === 0 ? (
        <div className="py-16 text-center">
          <BookMarked className="text-muted-foreground/30 mx-auto h-12 w-12" />
          <h3 className="mt-4 text-lg font-medium">No topics yet</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {debouncedSearch
              ? `No topics matching "${debouncedSearch}"`
              : "Start reading tutorials to see your topics here"}
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
        <div className="space-y-8">
          {allTopics.map((topic) => {
            const sections = (topic.sections ?? []) as TutorialSection[];
            const isSelected = selectedTopics.has(topic.nodeId);

            return (
              <Card
                key={topic.nodeId}
                id={`topic-${topic.nodeId}`}
                className={isSelected ? "ring-primary ring-2 ring-offset-2" : ""}
              >
                <CardContent className="p-0">
                  {/* Topic header */}
                  <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b px-5 py-4">
                    <div className="flex items-start gap-3">
                      {selectionMode && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleTopicSelection(topic.nodeId)}
                          className="mt-1"
                        />
                      )}
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold">
                          {debouncedSearch ? (
                            <TextHighlighter text={topic.nodeTitle} search={debouncedSearch} />
                          ) : (
                            topic.nodeTitle
                          )}
                        </h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {topic.examName && (
                            <Badge variant="outline" className="gap-0.5 text-[10px]">
                              <GraduationCap className="h-2.5 w-2.5" />
                              {topic.examName}
                            </Badge>
                          )}
                          <Badge variant="outline" className="gap-0.5 text-[10px]">
                            <BookOpen className="h-2.5 w-2.5" />
                            {topic.syllabusName}
                          </Badge>
                          {topic.estimatedReadMinutes && (
                            <Badge variant="secondary" className="gap-0.5 text-[10px]">
                              <Clock className="h-2.5 w-2.5" />
                              {topic.estimatedReadMinutes} min read
                            </Badge>
                          )}
                          {topic.wordCount && (
                            <Badge variant="secondary" className="gap-0.5 text-[10px]">
                              <FileText className="h-2.5 w-2.5" />
                              {topic.wordCount.toLocaleString()} words
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={topic.completionPercent >= 100 ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {topic.completionPercent >= 100 && <CheckCircle2 className="h-3 w-3" />}
                        {topic.completionPercent}% complete
                      </Badge>
                    </div>
                  </div>

                  {/* Tutorial content sections — styled with tutorial-reader */}
                  <article className="tutorial-reader px-5 py-4">
                    {sections.length > 0 ? (
                      sections
                        .sort((a, b) => a.order - b.order)
                        .map((section) => (
                          <div key={section.id} className="mb-6">
                            {debouncedSearch && section.plainText ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <TextHighlighter
                                  text={section.plainText}
                                  search={debouncedSearch}
                                />
                              </div>
                            ) : (
                              <div dangerouslySetInnerHTML={{ __html: section.htmlContent }} />
                            )}
                          </div>
                        ))
                    ) : topic.plainText ? (
                      debouncedSearch ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <TextHighlighter text={topic.plainText} search={debouncedSearch} />
                        </div>
                      ) : (
                        <MarkdownMessage content={topic.plainText} />
                      )
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        No content available for this topic.
                      </p>
                    )}
                  </article>

                  {/* Footer: actions */}
                  <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
                    <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                      <Clock className="h-2.5 w-2.5" />
                      Last read:{" "}
                      {new Date(topic.lastReadAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => setNotesDialogNodeId(topic.nodeId)}
                      >
                        <StickyNote className="h-3 w-3" />
                        View Notes
                      </Button>
                      <Link href={`/learn/${topic.syllabusId}?node=${topic.nodeId}` as "/"}>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          <ExternalLink className="h-3 w-3" />
                          Go to Tutorial
                        </Button>
                      </Link>
                    </div>
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
                disabled={topicsQuery.isFetching}
                className="gap-1"
              >
                {topicsQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Load More Topics"
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* View Notes Dialog */}
      <Dialog
        open={!!notesDialogNodeId}
        onOpenChange={(open) => !open && setNotesDialogNodeId(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-amber-500" />
              Notes for this Topic
            </DialogTitle>
          </DialogHeader>

          {notesQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : !notesQuery.data || notesQuery.data.length === 0 ? (
            <div className="py-8 text-center">
              <StickyNote className="text-muted-foreground/30 mx-auto h-8 w-8" />
              <p className="text-muted-foreground mt-2 text-sm">
                No notes saved for this topic yet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notesQuery.data.map((note) => (
                <div key={note.id} className="rounded-lg border p-4">
                  {note.keyword && (
                    <div className="mb-2 flex items-start gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                      <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">
                        <span className="font-semibold">Q:</span> {note.keyword}
                      </span>
                    </div>
                  )}
                  <MarkdownMessage content={note.noteContent ?? ""} />
                  <div className="text-muted-foreground mt-2 flex items-center gap-1 text-[10px]">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(note.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Exam Dialog */}
      {selectedSyllabusInfo?.sameSyllabus && (
        <GenerateExamDialog
          open={examDialogOpen}
          onOpenChange={(open) => {
            setExamDialogOpen(open);
            if (!open) clearSelection();
          }}
          syllabusId={selectedSyllabusInfo.syllabusId}
          selectedNodeIds={Array.from(selectedTopics)}
          mode="multi-topic"
        />
      )}

      <ScrollButtons containerRef={containerRef} />
    </div>
  );
}
