"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  StickyNote,
  Search,
  Clock,
  BookOpen,
  GraduationCap,
  FileText,
  Loader2,
  MessageCircleQuestion,
  Sparkles,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { GenerateExamFromNotesDialog } from "./generate-exam-from-notes-dialog";

const PAGE_SIZE = 20;

function truncateText(text: string, maxLen: number): string {
  if (!text) return "";
  const clean = text.replace(/\[\[suggest:\s*.+?\]\]/g, "").trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + "...";
}

export default function NotesPage(): React.ReactElement {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showExamDialog, setShowExamDialog] = useState(false);

  // Debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string): void {
    setSearch(value);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
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

  const notes = notesQuery.data ?? [];
  const hasMore = notes.length === PAGE_SIZE;

  function toggleSelect(id: number): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll(): void {
    if (selectedIds.size === notes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notes.map((n) => n.id)));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <StickyNote className="h-6 w-6 text-amber-500" />
            My Notes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Notes saved from your AI conversations
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search notes by keyword or content..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="bg-muted/50 flex items-center gap-3 rounded-lg border px-4 py-2">
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          <Button size="sm" className="gap-1" onClick={() => setShowExamDialog(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            Generate Exam
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-muted-foreground hover:text-foreground ml-auto text-xs"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Notes Grid */}
      {notesQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <div className="py-16 text-center">
          <StickyNote className="text-muted-foreground/30 mx-auto h-12 w-12" />
          <h3 className="mt-4 text-lg font-medium">No notes yet</h3>
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
        <>
          {/* Select all */}
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedIds.size === notes.length && notes.length > 0}
              onCheckedChange={selectAll}
            />
            <span>Select all</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {notes.map((note) => {
              const isSelected = selectedIds.has(note.id);
              const snippet = truncateText(note.noteContent ?? "", 150);

              return (
                <Card
                  key={note.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "border-primary ring-primary ring-1" : ""
                  }`}
                >
                  <CardContent className="p-4">
                    {/* Top row: checkbox + keyword */}
                    <div className="mb-2 flex items-start gap-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(note.id)}
                        className="mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div
                        className="min-w-0 flex-1"
                        onClick={() => {
                          router.push(`/dashboard/notes/details?highlight=${note.id}` as "/");
                        }}
                      >
                        {/* Question */}
                        {note.keyword ? (
                          <div className="mb-2 flex items-start gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                            <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2 text-xs">
                              <span className="font-semibold">Q:</span> {note.keyword}
                            </span>
                          </div>
                        ) : (
                          <p className="text-foreground mb-2 line-clamp-1 text-sm font-medium">
                            Note
                          </p>
                        )}

                        {/* Snippet */}
                        <p className="text-muted-foreground line-clamp-3 text-xs">{snippet}</p>

                        {/* Breadcrumb badges */}
                        <div className="mt-2 flex flex-wrap gap-1">
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
                        </div>

                        {/* Date + Ask AI */}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(note.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-2 text-[10px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              const context = note.keyword
                                ? `Based on this note:\n\nQuestion: ${note.keyword}\nAnswer: ${truncateText(note.noteContent ?? "", 500)}\n\nExplain this topic in more detail and help me understand it better.`
                                : `Based on this note:\n\n${truncateText(note.noteContent ?? "", 500)}\n\nExplain this topic in more detail and help me understand it better.`;
                              router.push(
                                `/dashboard/ai-chat?prefill=${encodeURIComponent(context)}` as "/",
                              );
                            }}
                          >
                            <MessageSquare className="h-2.5 w-2.5" />
                            Ask AI
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-4 pt-4">
            {offset > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
            )}
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="gap-1"
              >
                Load more
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </>
      )}

      {/* Generate Exam Dialog */}
      <GenerateExamFromNotesDialog
        open={showExamDialog}
        onOpenChange={setShowExamDialog}
        selectedNoteIds={Array.from(selectedIds)}
        onSuccess={(examId) => {
          setSelectedIds(new Set());
          router.push(`/practice/${examId}` as "/");
        }}
      />
    </div>
  );
}
