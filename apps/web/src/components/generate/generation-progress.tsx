"use client";

import { Loader2, StopCircle, BookOpen, Brain, GraduationCap, FileText, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { GeneratedQuestion } from "@examforge/shared";
import { QUESTION_TYPE_LABELS } from "@examforge/shared/constants";

interface GenerationSettings {
  examName?: string;
  provider: string;
  syllabusName?: string;
  topicName?: string;
  subject?: string;
  difficulty: string;
  questionType: string;
}

interface GenerationProgressProps {
  streamedQuestions: Partial<GeneratedQuestion>[];
  totalRequested: number;
  isLoading: boolean;
  error: Error | undefined;
  onStop: () => void;
  settings?: GenerationSettings;
}

const PROVIDER_LABELS: Record<string, { name: string; color: string }> = {
  anthropic: { name: "Claude", color: "bg-orange-100 text-orange-700 border-orange-200" },
  mistral: { name: "Mistral", color: "bg-blue-100 text-blue-700 border-blue-200" },
  openai: { name: "GPT-4o", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  google: { name: "Gemini", color: "bg-purple-100 text-purple-700 border-purple-200" },
  perplexity: { name: "Perplexity", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
};

function PartialQuestionCard({
  question,
  index,
}: {
  question: Partial<GeneratedQuestion>;
  index: number;
}): React.ReactElement {
  const content = question.content as Record<string, unknown> | undefined;
  const questionText = (content?.question as string) ?? (content?.assertion as string) ?? "";
  const isComplete = questionText.length > 0 && question.difficulty;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 bg-card rounded-lg border p-4 duration-300">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-sm font-medium">Question {index + 1}</span>
        {isComplete ? (
          <Badge variant="secondary" className="text-xs">
            {question.difficulty}
          </Badge>
        ) : (
          <Skeleton className="h-5 w-16" />
        )}
      </div>
      {questionText ? (
        <p className="line-clamp-2 text-sm">{questionText}</p>
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
  settings,
}: GenerationProgressProps): React.ReactElement {
  const completedCount = streamedQuestions.filter((q) => q.content && q.difficulty).length;
  const progressPercent = totalRequested > 0 ? (completedCount / totalRequested) * 100 : 0;
  const remaining = Math.max(0, totalRequested - streamedQuestions.length);

  const providerInfo = settings?.provider ? PROVIDER_LABELS[settings.provider] : null;
  const typeLabel = settings?.questionType
    ? QUESTION_TYPE_LABELS[settings.questionType as keyof typeof QUESTION_TYPE_LABELS]
    : null;

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {/* Generation Settings Summary */}
        {settings && (
          <div className="bg-muted/30 rounded-lg border p-4">
            <div className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
              Generation Settings
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {settings.examName && (
                <div className="flex items-center gap-2 text-sm">
                  <GraduationCap className="size-3.5 shrink-0 text-blue-500" />
                  <span className="text-muted-foreground">Exam:</span>
                  <span className="truncate font-medium">{settings.examName}</span>
                </div>
              )}
              {providerInfo && (
                <div className="flex items-center gap-2 text-sm">
                  <Brain className="size-3.5 shrink-0 text-purple-500" />
                  <span className="text-muted-foreground">Provider:</span>
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0 text-[10px] ${providerInfo.color}`}
                  >
                    {providerInfo.name}
                  </Badge>
                </div>
              )}
              {settings.syllabusName && (
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="size-3.5 shrink-0 text-green-500" />
                  <span className="text-muted-foreground">Syllabus:</span>
                  <span className="truncate font-medium">{settings.syllabusName}</span>
                </div>
              )}
              {settings.topicName && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="size-3.5 shrink-0 text-amber-500" />
                  <span className="text-muted-foreground">Topic:</span>
                  <span className="truncate font-medium">{settings.topicName}</span>
                </div>
              )}
              {settings.subject && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="size-3.5 shrink-0 text-indigo-500" />
                  <span className="text-muted-foreground">Subject:</span>
                  <span className="truncate font-medium">{settings.subject}</span>
                </div>
              )}
              {(settings.difficulty || typeLabel) && (
                <div className="flex items-center gap-2 text-sm">
                  <Gauge className="size-3.5 shrink-0 text-rose-500" />
                  {settings.difficulty && (
                    <>
                      <span className="text-muted-foreground">Difficulty:</span>
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
                        {settings.difficulty}
                      </Badge>
                    </>
                  )}
                  {typeLabel && (
                    <>
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium">{typeLabel}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 className="text-primary h-5 w-5 animate-spin" />
            <div>
              <div className="font-medium">Generating Questions...</div>
              <div className="text-muted-foreground text-sm">
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
          <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
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
              <div key={`skeleton-${i}`} className="bg-card rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="mb-1 h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
