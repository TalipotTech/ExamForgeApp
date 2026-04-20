"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  BookOpen,
  ArrowRight,
  ChevronDown,
  Calendar,
  MapPin,
  Building2,
  Hash,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { daysUntil, formatExamDate, getStatusBadge } from "@/lib/exam-display";

const ITEMS_PER_PAGE = 20;

export default function ExamCatalogPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const { data: allExams, isLoading } = trpc.portalIngestion.listAllExaminations.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  );

  // Extract categories with counts
  const categories = useMemo(() => {
    if (!allExams) return [];
    const catMap = new Map<string, number>();
    for (const exam of allExams) {
      const cat = exam.examCategory ?? "Other";
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }
    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [allExams]);

  // Filter
  const filtered = useMemo(() => {
    if (!allExams) return [];
    let result = allExams;

    if (categoryFilter) {
      result = result.filter((e) => (e.examCategory ?? "Other") === categoryFilter);
    }

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.examName.toLowerCase().includes(term) ||
          e.postName?.toLowerCase().includes(term) ||
          e.categoryNumber?.toLowerCase().includes(term) ||
          e.department?.toLowerCase().includes(term) ||
          e.portalName?.toLowerCase().includes(term),
      );
    }

    // Sort by days left (upcoming first, nearest first)
    return [...result].sort((a, b) => {
      const daysA = daysUntil(a.examDate);
      const daysB = daysUntil(b.examDate);
      // Upcoming exams (positive days) first, sorted nearest first
      if (daysA !== null && daysA > 0 && daysB !== null && daysB > 0) return daysA - daysB;
      if (daysA !== null && daysA > 0) return -1;
      if (daysB !== null && daysB > 0) return 1;
      // Past exams next (most recent first)
      if (daysA !== null && daysB !== null) return daysB - daysA;
      if (daysA !== null) return -1;
      if (daysB !== null) return 1;
      // No date last
      return a.examName.localeCompare(b.examName);
    });
  }, [allExams, categoryFilter, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="bg-background min-h-screen">
      {/* Nav */}
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
            {filtered.length} examinations available &bull; Browse schedules, practice, and prepare
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
                      setVisibleCount(ITEMS_PER_PAGE);
                    }}
                    placeholder="Exam name, keyword..."
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Categories */}
              {categories.length > 0 && (
                <div>
                  <label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wide">
                    Category
                  </label>
                  <div className="space-y-1.5">
                    {categories.map((cat) => (
                      <label
                        key={cat.name}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="category"
                          checked={categoryFilter === cat.name}
                          onChange={() => {
                            setCategoryFilter((prev) => (prev === cat.name ? null : cat.name));
                            setVisibleCount(ITEMS_PER_PAGE);
                          }}
                          className="accent-primary size-3.5"
                        />
                        <span
                          className={
                            categoryFilter === cat.name
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {cat.name}
                        </span>
                        <span className="text-muted-foreground/60 ml-auto text-[10px]">
                          {cat.count}
                        </span>
                      </label>
                    ))}
                    {categoryFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 w-full text-xs"
                        onClick={() => {
                          setCategoryFilter(null);
                          setVisibleCount(ITEMS_PER_PAGE);
                        }}
                      >
                        Clear filter
                      </Button>
                    )}
                  </div>
                </div>
              )}
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
                    setVisibleCount(ITEMS_PER_PAGE);
                  }}
                  placeholder="Search exams..."
                  className="pl-9"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Search className="text-muted-foreground/50 mb-4 size-12" />
                  <h3 className="text-lg font-medium">No exams match your search</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Try adjusting your search or filters
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {visible.map((exam, idx) => {
                    const days = daysUntil(exam.examDate);
                    const dateInfo = formatExamDate(exam.examDate);
                    const statusBadge = getStatusBadge(null, days);

                    return (
                      <Link
                        key={`${exam.id}-${idx}`}
                        href={
                          `/examinations/${exam.documentId}?search=${encodeURIComponent(exam.examName)}` as "/"
                        }
                      >
                        <Card className="group relative h-full cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
                          <CardContent className="pt-5">
                            {/* Badges */}
                            <div className="mb-3 flex flex-wrap gap-1.5">
                              {exam.examCategory && (
                                <Badge variant="secondary" className="text-xs capitalize">
                                  {exam.examCategory}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-xs ${statusBadge.className}`}
                              >
                                {statusBadge.label}
                              </Badge>
                              {exam.stage && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {exam.stage}
                                </Badge>
                              )}
                            </div>

                            {/* Name */}
                            <h3 className="group-hover:text-primary mb-1 text-sm font-semibold capitalize leading-snug">
                              {exam.examName.toLowerCase()}
                            </h3>
                            {exam.postName && (
                              <p className="text-muted-foreground mb-3 text-xs capitalize">
                                {exam.postName.toLowerCase()}
                              </p>
                            )}

                            {/* Date + Countdown */}
                            <div className="mb-3 grid grid-cols-2 gap-2">
                              <div className="bg-muted/30 rounded-lg border px-3 py-2">
                                <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                                  Exam Date
                                </p>
                                <p
                                  className={`font-mono text-xs font-semibold ${dateInfo.className}`}
                                >
                                  {dateInfo.text}
                                </p>
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
                                  {days !== null && days > 0
                                    ? `${days} days left`
                                    : days !== null
                                      ? "Completed"
                                      : "TBA"}
                                </p>
                              </div>
                            </div>

                            {/* Meta row */}
                            <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                              {exam.categoryNumber && (
                                <span className="flex items-center gap-0.5">
                                  <Hash className="size-3" />
                                  Cat. {String(exam.categoryNumber)}
                                </span>
                              )}
                              {exam.venue && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="size-3" />
                                  {String(exam.venue)}
                                </span>
                              )}
                              {exam.department && (
                                <span className="flex items-center gap-0.5">
                                  <Building2 className="size-3" />
                                  {String(exam.department)}
                                </span>
                              )}
                              {exam.portalName && (
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="size-3" />
                                  {exam.portalName}
                                </span>
                              )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between">
                              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                                <span className="flex items-center gap-1">
                                  <BookOpen className="size-3" />
                                  View Details
                                </span>
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
                {hasMore && (
                  <div className="mt-8 text-center">
                    <Button
                      variant="outline"
                      onClick={() => setVisibleCount((c) => c + ITEMS_PER_PAGE)}
                      className="gap-2"
                    >
                      Load More
                      <ChevronDown className="size-4" />
                    </Button>
                    <p className="text-muted-foreground mt-2 text-xs">
                      Showing {visible.length} of {filtered.length}
                    </p>
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
