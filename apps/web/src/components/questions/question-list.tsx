"use client";

import { useState } from "react";
import { Search, FilterX, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionCard } from "./question-card";
import { trpc } from "@/lib/trpc";
import { useDebounce } from "@/hooks/use-debounce";

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

const TYPE_OPTIONS = [
  { value: "mcq", label: "MCQ" },
  { value: "true_false", label: "True / False" },
  { value: "fill_blank", label: "Fill in the Blank" },
  { value: "match", label: "Match" },
  { value: "assertion", label: "Assertion–Reason" },
] as const;

const PAGE_SIZE = 20;

type Difficulty = "easy" | "medium" | "hard";
type QuestionType = "mcq" | "true_false" | "fill_blank" | "match" | "assertion";

export function QuestionList(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string>();
  const [difficulty, setDifficulty] = useState<Difficulty>();
  const [examId, setExamId] = useState<string>();
  const [type, setType] = useState<QuestionType>();
  const [source, setSource] = useState<string>();
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 300);

  const filtersQuery = trpc.question.filters.useQuery();

  const questionsQuery = trpc.question.list.useQuery(
    {
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      subject: subject || undefined,
      difficulty,
      examId: examId || undefined,
      type,
      source: source || undefined,
    },
    { placeholderData: (prev) => prev },
  );

  const deleteMutation = trpc.question.delete.useMutation({
    onSuccess: () => {
      questionsQuery.refetch();
    },
  });

  const hasFilters = search || subject || difficulty || examId || type || source;

  function clearFilters(): void {
    setSearch("");
    setSubject(undefined);
    setDifficulty(undefined);
    setExamId(undefined);
    setType(undefined);
    setSource(undefined);
    setPage(1);
  }

  function handlePageChange(newPage: number): void {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search questions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={examId ?? ""}
            onValueChange={(v) => {
              setExamId(v || undefined);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Exams" />
            </SelectTrigger>
            <SelectContent>
              {filtersQuery.data?.exams.map((exam) => (
                <SelectItem key={exam.id} value={exam.id}>
                  {exam.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={subject ?? ""}
            onValueChange={(v) => {
              setSubject(v || undefined);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              {filtersQuery.data?.subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={difficulty ?? ""}
            onValueChange={(v) => {
              setDifficulty((v as Difficulty) || undefined);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={type ?? ""}
            onValueChange={(v) => {
              setType((v as QuestionType) || undefined);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Question Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={source ?? ""}
            onValueChange={(v) => {
              setSource(v || undefined);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              {filtersQuery.data?.sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FilterX className="mr-1.5 size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      {questionsQuery.data && (
        <p className="text-sm text-muted-foreground">
          {questionsQuery.data.total === 0
            ? "No questions found"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, questionsQuery.data.total)} of ${questionsQuery.data.total} questions`}
        </p>
      )}

      {/* Loading state */}
      {questionsQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {questionsQuery.isError && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">
            Failed to load questions. Make sure the API server is running.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => questionsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {questionsQuery.data?.total === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            {hasFilters
              ? "No questions match your filters. Try broadening your search."
              : "No questions yet. Add some questions to get started."}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Question cards */}
      {questionsQuery.data && questionsQuery.data.total > 0 && (
        <div className="space-y-3">
          {questionsQuery.data.items.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              onDelete={(id) => deleteMutation.mutate({ id })}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {questionsQuery.data && questionsQuery.data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            <ChevronLeft className="mr-1 size-4" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {generatePageNumbers(page, questionsQuery.data.totalPages).map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">
                  ...
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  className="size-8 p-0"
                  onClick={() => handlePageChange(p as number)}
                >
                  {p}
                </Button>
              ),
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= questionsQuery.data.totalPages}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number,
): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: Array<number | "..."> = [1];

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}
