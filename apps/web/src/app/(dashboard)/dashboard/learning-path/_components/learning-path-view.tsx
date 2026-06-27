"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Route,
  RefreshCw,
  Loader2,
  BookOpen,
  Target,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-500",
  low: "bg-yellow-500",
};

export function LearningPathView(): React.ReactElement {
  const router = useRouter();
  const utils = trpc.useUtils();

  const dashboardQuery = trpc.learn.getDashboardData.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const exams = dashboardQuery.data?.selectedExams ?? [];

  const [examId, setExamId] = useState<string | undefined>();
  const [subject, setSubject] = useState<string | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!examId && exams.length > 0) setExamId(exams[0]!.examId);
  }, [exams, examId]);

  const lpQuery = trpc.learningPath.get.useQuery(
    { examId: examId ?? "", subject },
    { enabled: !!examId, staleTime: 60 * 1000 },
  );
  const data = lpQuery.data;

  async function handleRefresh(): Promise<void> {
    if (!examId) return;
    setIsRefreshing(true);
    try {
      await utils.learningPath.get.fetch({ examId, subject, refresh: true });
      await utils.learningPath.get.invalidate({ examId, subject });
    } finally {
      setIsRefreshing(false);
    }
  }

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Route className="text-muted-foreground size-8" />
          <p className="font-medium">No exam selected yet</p>
          <p className="text-muted-foreground text-sm">
            Add an examination from your dashboard to build a learning path.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Route className="size-6" />
            Your learning path
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Built from your understanding ratings, reading progress, and exam performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exams.length > 1 && (
            <select
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setSubject(undefined);
              }}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Subject chips */}
      {data && data.subjects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubject(undefined)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              !subject ? "bg-accent border-accent" : "border-border hover:bg-accent/50",
            )}
          >
            All subjects
          </button>
          {data.subjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                subject === s ? "bg-accent border-accent" : "border-border hover:bg-accent/50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {lpQuery.isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32 sm:col-span-2" />
        </div>
      ) : data.isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <TrendingUp className="text-muted-foreground size-8" />
            <p className="font-medium">Not enough signals yet</p>
            <p className="text-muted-foreground max-w-md text-sm">{data.summary}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Readiness + summary */}
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <ReadinessRing score={data.overallScore} />
                <p className="text-muted-foreground mt-2 text-xs">Readiness</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center py-6">
                <p className="text-sm leading-relaxed">{data.summary}</p>
              </CardContent>
            </Card>
          </div>

          {/* Improve these */}
          {data.improvements.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="size-4" />
                  Improve these
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.improvements.map((item) => (
                  <div key={item.nodeId} className="flex items-start gap-3 rounded-lg border p-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2.5 shrink-0 rounded-full",
                        PRIORITY_DOT[item.priority],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">{item.reason}</p>
                      <p className="text-muted-foreground mt-1 text-xs italic">
                        {item.suggestedAction}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {item.tutorialId && item.syllabusId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() =>
                            router.push(`/learn/${item.syllabusId}?node=${item.nodeId}` as "/")
                          }
                        >
                          <BookOpen className="size-3" />
                          Read
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          router.push(
                            `/dashboard/search?q=${encodeURIComponent(item.title)}&nodeId=${item.nodeId}` as "/",
                          )
                        }
                      >
                        <Target className="size-3" />
                        Practice
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Strengths */}
          {data.strengths.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  You&apos;re strong in
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.strengths.map((s) => (
                  <button
                    key={s.nodeId}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/dashboard/search?q=${encodeURIComponent(s.title)}&nodeId=${s.nodeId}` as "/",
                      )
                    }
                    className="border-border hover:bg-accent/50 rounded-full border px-3 py-1 text-xs transition-colors"
                  >
                    {s.title}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ReadinessRing({ score }: { score: number }): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="relative size-28">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-primary transition-all"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold">{Math.round(clamped)}</span>
      </div>
    </div>
  );
}
