"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  GraduationCap,
  Check,
  ArrowRight,
  Search,
  CalendarDays,
  BookOpen,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

function formatExamDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function isUpcoming(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) > new Date();
}

export default function OnboardingPage(): React.ReactElement {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  const examsQuery = trpc.onboarding.listAvailableExams.useQuery();
  const statusQuery = trpc.onboarding.getOnboardingStatus.useQuery(undefined, {
    retry: false,
  });
  const saveMutation = trpc.onboarding.saveSelectedExams.useMutation({
    onSuccess: async () => {
      toast.success("Welcome to ExamForge!");
      await updateSession();
      window.location.href = "/dashboard";
    },
    onError: (err) => toast.error(err.message),
  });
  const skipMutation = trpc.onboarding.skipOnboarding.useMutation({
    onSuccess: async () => {
      await updateSession();
      window.location.href = "/dashboard";
    },
    onError: (err) => toast.error(err.message),
  });

  // Redirect if already completed onboarding — in useEffect to avoid setState during render
  useEffect(() => {
    if (statusQuery.data?.completed && !redirecting) {
      setRedirecting(true);
      router.push("/dashboard" as "/");
      router.refresh();
    }
  }, [statusQuery.data?.completed, redirecting, router]);

  // Sort exams: upcoming first (by date asc), then no-date exams
  const sortedExams = useMemo(() => {
    const allExams = examsQuery.data ?? [];
    return [...allExams].sort((a, b) => {
      const aDate = a.examDate ? new Date(a.examDate).getTime() : Infinity;
      const bDate = b.examDate ? new Date(b.examDate).getTime() : Infinity;
      const aUpcoming = isUpcoming(a.examDate);
      const bUpcoming = isUpcoming(b.examDate);

      // Upcoming exams first
      if (aUpcoming && !bUpcoming) return -1;
      if (!aUpcoming && bUpcoming) return 1;

      // Among upcoming, sort by nearest date first
      if (aUpcoming && bUpcoming) return aDate - bDate;

      // Among non-upcoming, by name
      return a.name.localeCompare(b.name);
    });
  }, [examsQuery.data]);

  // Filter exams by search query
  const filteredExams = useMemo(() => {
    if (!searchQuery.trim()) return sortedExams;
    const q = searchQuery.toLowerCase();
    return sortedExams.filter(
      (exam) =>
        exam.name.toLowerCase().includes(q) ||
        (exam.conductingBody?.toLowerCase().includes(q) ?? false) ||
        exam.category.toLowerCase().includes(q),
    );
  }, [sortedExams, searchQuery]);

  // Group exams by category
  const examsByCategory = useMemo(() => {
    return filteredExams.reduce<Record<string, typeof filteredExams>>((acc, exam) => {
      const cat = exam.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat]!.push(exam);
      return acc;
    }, {});
  }, [filteredExams]);

  const toggleExam = (examId: string): void => {
    setSelectedExams((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) {
        next.delete(examId);
      } else {
        next.add(examId);
      }
      return next;
    });
  };

  const handleContinue = (): void => {
    if (selectedExams.size === 0) {
      toast.error("Please select at least one exam");
      return;
    }
    saveMutation.mutate({
      exams: Array.from(selectedExams).map((examId) => ({ examId })),
    });
  };

  const handleSkip = (): void => {
    skipMutation.mutate();
  };

  const isLoading = examsQuery.isLoading;
  const isSaving = saveMutation.isPending || skipMutation.isPending;
  const totalExams = examsQuery.data?.length ?? 0;

  // Show loading while redirecting
  if (redirecting) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center px-4 py-12">
        <div className="w-full max-w-3xl">
          {/* Heading */}
          <div className="mb-6 text-center">
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <GraduationCap className="text-primary h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">What are you preparing for?</h1>
            <p className="text-muted-foreground mt-2">
              Select the exams you&apos;re preparing for. This helps us personalize your dashboard.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          ) : totalExams === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No exams available yet.</p>
              <button
                onClick={handleSkip}
                disabled={isSaving}
                className="text-primary mt-4 text-sm hover:underline"
              >
                {skipMutation.isPending ? "Skipping..." : "Skip for now"}
              </button>
            </div>
          ) : (
            <>
              {/* Search Box */}
              <div className="relative mb-6">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search exams by name, category, or conducting body..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {searchQuery && (
                  <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {filteredExams.length} of {totalExams}
                  </span>
                )}
              </div>

              {/* Exam Grid by Category */}
              {Object.keys(examsByCategory).length === 0 ? (
                <div className="text-muted-foreground py-12 text-center">
                  <p>No exams found matching &ldquo;{searchQuery}&rdquo;</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(examsByCategory).map(([category, categoryExams]) => (
                    <div key={category}>
                      <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wider">
                        {category}
                      </h2>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {categoryExams?.map((exam) => {
                          const isSelected = selectedExams.has(exam.id);
                          const upcoming = isUpcoming(exam.examDate);
                          const dateStr = formatExamDate(exam.examDate);
                          const qCount = exam.questionCount ?? 0;
                          const sCount = Number(exam.syllabusCount) || 0;

                          return (
                            <Card
                              key={exam.id}
                              className={`cursor-pointer transition-all hover:shadow-md ${
                                isSelected
                                  ? "border-primary bg-primary/5 ring-primary ring-1"
                                  : "hover:border-foreground/20"
                              }`}
                              onClick={() => toggleExam(exam.id)}
                            >
                              <CardContent className="flex items-start gap-3 p-3">
                                <div
                                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                    isSelected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-muted-foreground/30"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3.5 w-3.5" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium leading-tight">{exam.name}</p>
                                  {exam.conductingBody && (
                                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                      {exam.conductingBody}
                                    </p>
                                  )}

                                  {/* Info badges */}
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {dateStr && (
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                          upcoming
                                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                                            : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        <CalendarDays className="h-2.5 w-2.5" />
                                        {dateStr}
                                      </span>
                                    )}
                                    {sCount > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                                        <BookOpen className="h-2.5 w-2.5" />
                                        Syllabus
                                      </span>
                                    )}
                                    {qCount > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                                        <FileText className="h-2.5 w-2.5" />
                                        {qCount} Q
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="mt-8 flex flex-col items-center gap-3 pb-8">
                {selectedExams.size > 0 && (
                  <Badge variant="secondary" className="mb-2">
                    {selectedExams.size} exam{selectedExams.size > 1 ? "s" : ""} selected
                  </Badge>
                )}
                <Button
                  size="lg"
                  className="w-full max-w-xs gap-2"
                  onClick={handleContinue}
                  disabled={selectedExams.size === 0 || isSaving}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <button
                  onClick={handleSkip}
                  disabled={isSaving}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  {skipMutation.isPending ? "Skipping..." : "Skip for now"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
