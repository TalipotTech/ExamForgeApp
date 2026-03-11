"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, BookOpen, ArrowRight, ChevronDown, MinusCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const CATEGORIES = [
  {
    id: "pharmacy",
    label: "Pharmacy",
    color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300",
  },
  {
    id: "medical",
    label: "Medical",
    color: "text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300",
  },
  {
    id: "civil_services",
    label: "Civil Services",
    color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300",
  },
  {
    id: "state_psc",
    label: "State PSC",
    color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300",
  },
  {
    id: "engineering",
    label: "Engineering",
    color: "text-purple-600 bg-purple-100 dark:bg-purple-900 dark:text-purple-300",
  },
] as const;

const STATUSES = ["all", "upcoming", "active", "past"] as const;

const SORTS = [
  { value: "date", label: "Exam Date" },
  { value: "popularity", label: "Popularity" },
  { value: "questions", label: "Questions Available" },
  { value: "name", label: "Name (A-Z)" },
] as const;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getCategoryStyle(category: string): string {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat?.color ?? "text-gray-600 bg-gray-100 dark:bg-gray-900 dark:text-gray-300";
}

function getCategoryLabel(category: string): string {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat?.label ?? category;
}

function formatExamDate(
  examDate: string | Date | null,
  dateConfidence?: string | null,
): { text: string; suffix: string; className: string } {
  if (!examDate) return { text: "TBA", suffix: "", className: "text-muted-foreground" };
  const d = new Date(examDate as string);
  const formatted = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  switch (dateConfidence) {
    case "confirmed":
      return { text: formatted, suffix: " \u2713", className: "text-green-600" };
    case "approximate":
      return { text: `~${formatted}`, suffix: "", className: "text-yellow-600" };
    case "inferred":
      return { text: `~${formatted}`, suffix: " ?", className: "text-orange-500" };
    default:
      return { text: formatted, suffix: "", className: "" };
  }
}

export default function ExamCatalogPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("date");
  const [page, setPage] = useState(1);

  const queryInput = useMemo(
    () => ({
      category: categoryFilter.length === 1 ? categoryFilter[0] : undefined,
      status: statusFilter !== "all" ? (statusFilter as "upcoming" | "active" | "past") : undefined,
      search: search || undefined,
      sort: sort as "date" | "popularity" | "questions" | "name",
      page,
      limit: 12,
    }),
    [categoryFilter, statusFilter, search, sort, page],
  );

  const examQuery = trpc.exam.listPublic.useQuery(queryInput, {
    staleTime: 5 * 60 * 1000,
  });

  const allExams = examQuery.data?.exams ?? [];
  const total = examQuery.data?.total ?? 0;
  const totalPages = examQuery.data?.totalPages ?? 1;

  // Client-side multi-category filter (API only supports 1 category)
  const filteredExams =
    categoryFilter.length > 1
      ? allExams.filter((e) => categoryFilter.includes(e.category))
      : allExams;

  function toggleCategory(cat: string): void {
    setCategoryFilter((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    setPage(1);
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Simple Nav */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/exams" className="text-foreground font-medium">
              Exams
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Exam Catalog</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {total} exams tracked &bull;{" "}
            {filteredExams.filter((e) => e.status === "upcoming").length} upcoming &bull;{" "}
            {filteredExams.reduce((a, e) => a + (e.questionCount ?? 0), 0).toLocaleString()}{" "}
            questions available
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* Filter Sidebar */}
          <aside className="hidden lg:block">
            <div className="bg-card sticky top-20 space-y-6 rounded-lg border p-4">
              {/* Search */}
              <div>
                <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wide">
                  Search
                </label>
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Exam name, keyword..."
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wide">
                  Category
                </label>
                <div className="space-y-1.5">
                  {CATEGORIES.map((cat) => (
                    <label key={cat.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={categoryFilter.includes(cat.id)}
                        onChange={() => toggleCategory(cat.id)}
                        className="accent-primary size-3.5 rounded"
                      />
                      <span
                        className={
                          categoryFilter.includes(cat.id)
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {cat.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wide">
                  Status
                </label>
                <div className="space-y-1.5">
                  {STATUSES.map((s) => (
                    <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="status"
                        checked={statusFilter === s}
                        onChange={() => {
                          setStatusFilter(s);
                          setPage(1);
                        }}
                        className="accent-primary size-3.5"
                      />
                      <span
                        className={statusFilter === s ? "text-foreground" : "text-muted-foreground"}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wide">
                  Sort By
                </label>
                <Select
                  value={sort}
                  onValueChange={(v) => {
                    setSort(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </aside>

          {/* Cards Grid */}
          <div>
            {/* Mobile search bar */}
            <div className="mb-4 lg:hidden">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search exams..."
                  className="pl-9"
                />
              </div>
            </div>

            {examQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : filteredExams.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Search className="text-muted-foreground/50 mb-4 size-12" />
                  <h3 className="text-lg font-medium">No exams match your filters</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Try adjusting your search or filters
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredExams.map((exam) => {
                    const days = daysUntil(
                      exam.examDate ? (exam.examDate as unknown as string) : null,
                    );
                    const isFeatured = exam.isFeatured;

                    return (
                      <Link key={exam.id} href={`/exams/${exam.id}` as "/"}>
                        <Card
                          className={`group relative cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${isFeatured ? "border-primary/30" : ""}`}
                        >
                          {isFeatured && (
                            <div className="absolute right-3 top-3">
                              <Badge
                                variant="outline"
                                className="border-yellow-500/50 bg-yellow-500/10 text-xs text-yellow-600"
                              >
                                ★ Featured
                              </Badge>
                            </div>
                          )}

                          <CardContent className="pt-5">
                            {/* Badges */}
                            <div className="mb-3 flex flex-wrap gap-1.5">
                              <Badge
                                variant="secondary"
                                className={`text-xs ${getCategoryStyle(exam.category)}`}
                              >
                                {getCategoryLabel(exam.category)}
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {exam.status ?? "active"}
                              </Badge>
                              {exam.level && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {exam.level}
                                </Badge>
                              )}
                            </div>

                            {/* Name + Body */}
                            <h3 className="group-hover:text-primary mb-1 text-base font-bold leading-tight">
                              {exam.name}
                            </h3>
                            <p className="text-muted-foreground mb-3 text-xs">
                              {exam.conductingBody ?? ""}
                            </p>

                            {/* Date + Countdown */}
                            <div className="mb-3 grid grid-cols-2 gap-2">
                              <div className="bg-muted/30 rounded-lg border px-3 py-2">
                                <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                                  Exam Date
                                </p>
                                {((): React.ReactElement => {
                                  const dateInfo = formatExamDate(
                                    exam.examDate as unknown as string | null,
                                    (exam as Record<string, unknown>).dateConfidence as
                                      | string
                                      | undefined,
                                  );
                                  return (
                                    <p
                                      className={`font-mono text-xs font-semibold ${dateInfo.className}`}
                                    >
                                      {dateInfo.text}
                                      {dateInfo.suffix}
                                    </p>
                                  );
                                })()}
                              </div>
                              <div className="bg-muted/30 rounded-lg border px-3 py-2">
                                <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                                  {days !== null && days > 0 ? "Countdown" : "Status"}
                                </p>
                                <p
                                  className={`font-mono text-xs font-semibold ${
                                    days !== null && days > 0 && days <= 30
                                      ? "text-yellow-600"
                                      : days !== null && days > 0
                                        ? "text-green-600"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {days !== null && days > 0 ? `${days} days left` : "Completed"}
                                </p>
                              </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between">
                              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                                <span className="flex items-center gap-1">
                                  <BookOpen className="size-3" />
                                  <strong className="text-foreground">
                                    {(exam.questionCount ?? 0).toLocaleString()}
                                  </strong>{" "}
                                  Qs
                                </span>
                                {exam.negativeMarking && (
                                  <span className="flex items-center gap-1 text-red-500">
                                    <MinusCircle className="size-3" />
                                    Negative
                                  </span>
                                )}
                              </div>
                              <Button size="sm" variant="default" className="h-7 gap-1 text-xs">
                                Start Practice
                                <ArrowRight className="size-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>

                {/* Load More */}
                {page < totalPages && (
                  <div className="mt-8 text-center">
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => p + 1)}
                      className="gap-2"
                    >
                      Load More
                      <ChevronDown className="size-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
