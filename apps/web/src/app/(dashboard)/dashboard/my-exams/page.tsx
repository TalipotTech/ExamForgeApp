"use client";

import Link from "next/link";
import {
  FileQuestion,
  Trash2,
  Play,
  Clock,
  Trophy,
  Loader2,
  BarChart3,
  Zap,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { VoiceRecapButton } from "@/components/voice-tutor/voice-recap-button";

export default function MyExamsPage(): React.ReactElement {
  const examsQuery = trpc.tutorialAgent.listUserExams.useQuery({});
  const quotaQuery = trpc.tutorialAgent.getExamQuota.useQuery(undefined, {
    staleTime: 30_000,
  });
  const deleteExamMutation = trpc.tutorialAgent.deleteUserExam.useMutation({
    onSuccess: () => {
      toast.success("Exam deleted");
      examsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (examsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <h1 className="text-2xl font-bold">My Practice Exams</h1>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const exams = examsQuery.data ?? [];
  const quota = quotaQuery.data;
  const quotaPercent = quota ? Math.min((quota.used / quota.limit) * 100, 100) : 0;
  const isQuotaNearLimit = quota
    ? quota.used >= quota.limit - 2 && quota.used < quota.limit
    : false;
  const isQuotaExhausted = quota ? quota.used >= quota.limit : false;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {/* Header with quota badge */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Practice Exams</h1>
        <div className="flex items-center gap-3">
          {/* Exam generation quota badge */}
          {quota && (
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  isQuotaExhausted ? "destructive" : isQuotaNearLimit ? "outline" : "secondary"
                }
                className={cn(
                  "gap-1.5 px-3 py-1",
                  isQuotaNearLimit && "border-amber-500 text-amber-700 dark:text-amber-300",
                )}
              >
                <Zap className="size-3" />
                {quota.used}/{quota.limit} generated
                <span className="text-[10px] opacity-70">({quota.planName})</span>
              </Badge>
              {isQuotaExhausted && (
                <Link href="/pricing">
                  <Button size="sm" variant="default" className="h-7 gap-1 text-xs">
                    <Crown className="size-3" />
                    Upgrade
                  </Button>
                </Link>
              )}
            </div>
          )}
          <Badge variant="secondary">{exams.length} exams</Badge>
        </div>
      </div>

      {/* Quota progress bar */}
      {quota && (
        <div className="space-y-1">
          <Progress
            value={quotaPercent}
            className={cn(
              "h-2",
              isQuotaExhausted
                ? "[&>div]:bg-destructive"
                : isQuotaNearLimit
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-primary",
            )}
          />
          <p className="text-muted-foreground text-xs">
            {quota.used} of {quota.limit} exam generations used this month on {quota.planName} plan
            {isQuotaExhausted && (
              <span className="text-destructive ml-1 font-medium">
                — Limit reached.{" "}
                <Link
                  href="/pricing"
                  className="hover:text-destructive/80 underline underline-offset-2"
                >
                  Upgrade for more
                </Link>
              </span>
            )}
          </p>
        </div>
      )}

      {exams.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">
            <FileQuestion className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-lg font-medium">No practice exams yet</p>
            <p className="mt-1 text-sm">
              Generate practice exams from tutorials to start practicing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const attempts = exam.timesAttempted ?? 0;
            const hasAttempts = attempts > 0;
            const bestScore = exam.bestScore ?? 0;

            return (
              <Card key={exam.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{exam.title}</h3>
                      {/* Per-exam attempt badge */}
                      {hasAttempts && (
                        <Badge
                          variant={
                            bestScore >= 80 ? "default" : bestScore >= 60 ? "secondary" : "outline"
                          }
                          className={cn(
                            "text-xs",
                            bestScore >= 80
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              : bestScore >= 60
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                : "",
                          )}
                        >
                          {attempts}x taken
                          {bestScore > 0 && ` · ${Math.round(bestScore)}%`}
                        </Badge>
                      )}
                      {!hasAttempts && (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          Not attempted
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <FileQuestion className="h-3.5 w-3.5" />
                        {exam.questionCount} questions
                      </span>
                      {hasAttempts && (
                        <span className="flex items-center gap-1">
                          <Play className="h-3.5 w-3.5" />
                          {attempts} attempt{attempts !== 1 ? "s" : ""}
                        </span>
                      )}
                      {bestScore > 0 && (
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3.5 w-3.5 text-amber-500" />
                          Best: {Math.round(bestScore)}%
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(exam.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasAttempts && (
                      <>
                        <Link href={`/dashboard/my-exams/results/${exam.id}` as "/"}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Results
                          </Button>
                        </Link>
                        <VoiceRecapButton
                          examId={(exam as Record<string, unknown>).examId as string | undefined}
                          variant="outline"
                          size="sm"
                        />
                      </>
                    )}
                    <Link href={`/practice/${exam.id}` as "/"}>
                      <Button variant="default" size="sm" className="gap-1.5">
                        <Play className="h-3.5 w-3.5" />
                        {hasAttempts ? "Retake" : "Take Exam"}
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        setDeletingId(exam.id);
                        deleteExamMutation.mutate(
                          { id: exam.id },
                          { onSettled: () => setDeletingId(null) },
                        );
                      }}
                      disabled={deletingId === exam.id}
                    >
                      {deletingId === exam.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
