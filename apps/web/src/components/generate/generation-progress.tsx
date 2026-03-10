"use client";

import { Loader2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { GeneratedQuestion } from "@examforge/shared";

interface GenerationProgressProps {
  streamedQuestions: Partial<GeneratedQuestion>[];
  totalRequested: number;
  isLoading: boolean;
  error: Error | undefined;
  onStop: () => void;
}

function PartialQuestionCard({
  question,
  index,
}: {
  question: Partial<GeneratedQuestion>;
  index: number;
}): React.ReactElement {
  const content = question.content as Record<string, unknown> | undefined;
  const questionText =
    (content?.question as string) ??
    (content?.assertion as string) ??
    "";
  const isComplete = questionText.length > 0 && question.difficulty;

  return (
    <div className="rounded-lg border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">
          Question {index + 1}
        </span>
        {isComplete ? (
          <Badge variant="secondary" className="text-xs">
            {question.difficulty}
          </Badge>
        ) : (
          <Skeleton className="h-5 w-16" />
        )}
      </div>
      {questionText ? (
        <p className="text-sm line-clamp-2">{questionText}</p>
      ) : (
        <Skeleton className="h-4 w-full" />
      )}
    </div>
  );
}

export function GenerationProgress({
  streamedQuestions,
  totalRequested,
  isLoading,
  error,
  onStop,
}: GenerationProgressProps): React.ReactElement {
  const completedCount = streamedQuestions.filter(
    (q) => q.content && q.difficulty,
  ).length;
  const progressPercent =
    totalRequested > 0 ? (completedCount / totalRequested) * 100 : 0;
  const remaining = Math.max(0, totalRequested - streamedQuestions.length);

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <div className="font-medium">Generating Questions...</div>
              <div className="text-sm text-muted-foreground">
                {completedCount} of {totalRequested} questions
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onStop}>
            <StopCircle className="mr-2 h-4 w-4" />
            Stop
          </Button>
        </div>

        {/* Progress Bar */}
        <Progress value={progressPercent} className="h-2" />

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}
          </div>
        )}

        {/* Streamed Questions */}
        <div className="grid gap-3 sm:grid-cols-2">
          {streamedQuestions.map((q, i) => (
            <PartialQuestionCard key={i} question={q} index={i} />
          ))}

          {/* Skeleton placeholders for remaining */}
          {isLoading &&
            Array.from({ length: Math.min(remaining, 4) }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="rounded-lg border bg-card p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
