"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle,
  XCircle,
  MinusCircle,
  Clock,
  ChevronDown,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceRecapButton } from "@/components/voice-tutor/voice-recap-button";

type QuestionResult = {
  id: string;
  type: string;
  content: Record<string, unknown>;
  subject: string;
  topic: string | null;
  correctAnswer?: unknown;
  explanation: string;
};

type ResultsData = {
  id: string;
  examId?: string;
  examName: string;
  score: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  questions: QuestionResult[];
  userAnswers: Record<string, number>;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export function ExamResults({ data }: { data: ResultsData }): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exam Results</h1>
          <p className="text-muted-foreground">{data.examName}</p>
        </div>
        <div className="flex items-center gap-2">
          <VoiceRecapButton
            questions={data.questions
              .map((q) => {
                const c = q.content as {
                  question?: string;
                  options?: string[];
                  answer?: number;
                  explanation?: string;
                };
                return {
                  question: c.question ?? "",
                  options: c.options ?? [],
                  correctAnswer: c.answer ?? 0,
                  explanation: q.explanation || c.explanation || "",
                  subject: q.subject,
                };
              })
              .filter((q) => q.question && q.options.length > 0)}
            title={data.examName}
          />
          <Button asChild>
            <Link href={"/exams/start" as "/"}>
              <RotateCcw className="size-4" />
              Take Another Exam
            </Link>
          </Button>
        </div>
      </div>

      {/* Score card */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Trophy
                className={cn(
                  "size-5",
                  data.score >= 70
                    ? "text-green-500"
                    : data.score >= 40
                      ? "text-orange-500"
                      : "text-red-500",
                )}
              />
              <span className="text-3xl font-bold">{Math.round(data.score)}%</span>
            </div>
            <Progress value={data.score} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Correct</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="size-5 text-green-500" />
              <span className="text-3xl font-bold">{data.correct}</span>
              <span className="text-muted-foreground text-sm">/ {data.totalQuestions}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Incorrect</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="size-5 text-red-500" />
              <span className="text-3xl font-bold">{data.incorrect}</span>
              {data.unanswered > 0 && (
                <span className="text-muted-foreground text-sm">+ {data.unanswered} skipped</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Time Taken</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="size-5 text-blue-500" />
              <span className="text-3xl font-bold">{formatDuration(data.timeTakenSeconds)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-question breakdown */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Question Breakdown</h2>
        {data.questions.map((q, i) => (
          <QuestionBreakdown
            key={q.id}
            question={q}
            index={i}
            userAnswer={data.userAnswers[q.id]}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionBreakdown({
  question,
  index,
  userAnswer,
}: {
  question: QuestionResult;
  index: number;
  userAnswer: number | undefined;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  const isCorrect = userAnswer !== undefined && userAnswer === question.correctAnswer;
  const isUnanswered = userAnswer === undefined;

  const StatusIcon = isUnanswered ? MinusCircle : isCorrect ? CheckCircle : XCircle;
  const statusColor = isUnanswered
    ? "text-muted-foreground"
    : isCorrect
      ? "text-green-500"
      : "text-red-500";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "hover:bg-accent flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors",
            open && "rounded-b-none",
          )}
        >
          <StatusIcon className={cn("size-5 shrink-0", statusColor)} />
          <span className="text-muted-foreground min-w-[2rem] text-sm font-medium">
            Q{index + 1}
          </span>
          <span className="flex-1 truncate text-sm">
            {question.type === "assertion"
              ? (question.content.assertion as string)
              : (question.content.question as string)}
          </span>
          <Badge variant="outline" className="shrink-0 text-xs">
            {question.subject}
          </Badge>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/30 flex flex-col gap-3 rounded-b-lg border border-t-0 p-4">
          {/* Question text */}
          {question.type === "assertion" ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>
                <strong>Assertion:</strong> {question.content.assertion as string}
              </p>
              <p>
                <strong>Reason:</strong> {question.content.reason as string}
              </p>
            </div>
          ) : (
            <p className="text-sm font-medium">{question.content.question as string}</p>
          )}

          {/* Options with correct/incorrect highlights */}
          {question.type === "mcq" &&
            (question.content.options as string[]).map((opt: string, i: number) => {
              const isCorrectOption = i === (question.correctAnswer as number);
              const isUserChoice = i === userAnswer;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    isCorrectOption && "border-green-500 bg-green-50 dark:bg-green-950/20",
                    isUserChoice &&
                      !isCorrectOption &&
                      "border-red-500 bg-red-50 dark:bg-red-950/20",
                  )}
                >
                  <span className="font-semibold">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                  {isCorrectOption && <CheckCircle className="ml-auto size-4 text-green-500" />}
                  {isUserChoice && !isCorrectOption && (
                    <XCircle className="ml-auto size-4 text-red-500" />
                  )}
                </div>
              );
            })}

          {question.type === "true_false" && (
            <div className="flex gap-4 text-sm">
              {["True", "False"].map((label, i) => {
                const correctVal = question.correctAnswer === true ? 0 : 1;
                const isCorrectOption = i === correctVal;
                const isUserChoice = i === userAnswer;
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-center",
                      isCorrectOption && "border-green-500 bg-green-50 dark:bg-green-950/20",
                      isUserChoice &&
                        !isCorrectOption &&
                        "border-red-500 bg-red-50 dark:bg-red-950/20",
                    )}
                  >
                    {label}
                    {isCorrectOption && " ✓"}
                  </div>
                );
              })}
            </div>
          )}

          {/* Explanation */}
          {question.explanation && (
            <div className="rounded-md bg-blue-50 p-3 text-sm dark:bg-blue-950/20">
              <p className="mb-1 font-semibold text-blue-700 dark:text-blue-400">Explanation</p>
              <p className="text-blue-900 dark:text-blue-300">{question.explanation}</p>
            </div>
          )}

          {/* Status */}
          <div className="text-muted-foreground text-xs">
            {isUnanswered
              ? "Not answered"
              : isCorrect
                ? "Correctly answered"
                : "Incorrectly answered"}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
