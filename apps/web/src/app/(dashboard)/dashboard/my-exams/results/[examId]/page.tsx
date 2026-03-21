"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  RotateCcw,
  ArrowLeft,
  Trophy,
  Target,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceRecapButton } from "@/components/voice-tutor/voice-recap-button";

type DetailedQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  userAnswer: number | null;
  isCorrect: boolean;
  explanation: string;
  difficulty: string;
  subject: string;
};

type ExamResult = {
  score: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  questions: DetailedQuestion[];
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function ExamResultsPage(): React.ReactElement {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const examId = Number(params.examId);

  const [result, setResult] = useState<ExamResult | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Try to get result from session storage (just submitted)
  useEffect(() => {
    const stored = sessionStorage.getItem(`practice-result-${examId}`);
    if (stored) {
      setResult(JSON.parse(stored));
      sessionStorage.removeItem(`practice-result-${examId}`);
    }
  }, [examId]);

  // Fallback: fetch from server if no session storage
  const { data: serverResult, isLoading } = trpc.tutorialAgent.getUserExamResults.useQuery(
    { id: examId },
    { enabled: !result, refetchOnWindowFocus: false },
  );

  const displayResult =
    result ??
    (serverResult
      ? {
          score: serverResult.bestScore ?? 0,
          correct: serverResult.questions.filter((q) => q.isCorrect).length,
          incorrect: serverResult.questions.filter((q) => q.userAnswer !== null && !q.isCorrect)
            .length,
          unanswered: serverResult.questions.filter((q) => q.userAnswer === null).length,
          totalQuestions: serverResult.questionCount,
          timeTakenSeconds: 0,
          questions: serverResult.questions,
        }
      : null);

  if (isLoading && !result) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Skeleton className="mb-4 h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!displayResult) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground text-lg">No results found</p>
          <Button className="mt-4" onClick={() => router.push("/dashboard/my-exams")}>
            Back to My Exams
          </Button>
        </div>
      </div>
    );
  }

  const scoreColor =
    displayResult.score >= 80
      ? "text-green-600"
      : displayResult.score >= 60
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Score Card */}
      <Card className="mb-8">
        <CardHeader className="text-center">
          <div className="bg-muted mx-auto mb-4 flex size-20 items-center justify-center rounded-full">
            <Trophy className={cn("size-10", scoreColor)} />
          </div>
          <CardTitle className="text-3xl">
            <span className={scoreColor}>{displayResult.score}%</span>
          </CardTitle>
          <p className="text-muted-foreground">
            {displayResult.score >= 80
              ? "Excellent work!"
              : displayResult.score >= 60
                ? "Good effort!"
                : "Keep practicing!"}
          </p>
        </CardHeader>
        <CardContent>
          <Progress
            value={displayResult.score}
            className={cn(
              "mb-6 h-3",
              displayResult.score >= 80
                ? "[&>div]:bg-green-500"
                : displayResult.score >= 60
                  ? "[&>div]:bg-yellow-500"
                  : "[&>div]:bg-red-500",
            )}
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={<Target className="text-muted-foreground size-5" />}
              label="Total"
              value={displayResult.totalQuestions}
            />
            <StatCard
              icon={<CheckCircle2 className="size-5 text-green-500" />}
              label="Correct"
              value={displayResult.correct}
            />
            <StatCard
              icon={<XCircle className="size-5 text-red-500" />}
              label="Incorrect"
              value={displayResult.incorrect}
            />
            <StatCard
              icon={<MinusCircle className="text-muted-foreground size-5" />}
              label="Unanswered"
              value={displayResult.unanswered}
            />
          </div>

          {displayResult.timeTakenSeconds > 0 && (
            <div className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-sm">
              <Clock className="size-4" />
              Time taken: {formatDuration(displayResult.timeTakenSeconds)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="mb-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => router.push(`/practice/${examId}` as "/")} className="gap-2">
          <RotateCcw className="size-4" />
          Retake Exam
        </Button>
        <Button variant="outline" onClick={() => setShowReview(!showReview)}>
          {showReview ? "Hide Review" : "Review Answers"}
        </Button>
        <VoiceRecapButton examId={serverResult?.examId} />
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/my-exams")}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          My Exams
        </Button>
      </div>

      {/* Question Review */}
      {showReview && (
        <div className="flex flex-col gap-6">
          <h2 className="text-xl font-semibold">Question Review</h2>
          {displayResult.questions.map((q, i) => (
            <QuestionReviewCard key={q.id} question={q} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
      {icon}
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function QuestionReviewCard({
  question: q,
  index,
}: {
  question: DetailedQuestion;
  index: number;
}): React.ReactElement {
  const wasAnswered = q.userAnswer !== null;

  return (
    <Card
      className={cn(
        "border-l-4",
        q.isCorrect ? "border-l-green-500" : wasAnswered ? "border-l-red-500" : "border-l-gray-300",
      )}
    >
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-muted-foreground text-sm font-medium">Q{index + 1}</span>
          <Badge variant="outline" className="text-xs capitalize">
            {q.difficulty}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {q.subject}
          </Badge>
          {q.isCorrect ? (
            <CheckCircle2 className="ml-auto size-5 text-green-500" />
          ) : wasAnswered ? (
            <XCircle className="ml-auto size-5 text-red-500" />
          ) : (
            <MinusCircle className="ml-auto size-5 text-gray-400" />
          )}
        </div>

        <p className="mb-4 font-medium">{q.question}</p>

        <div className="flex flex-col gap-2">
          {q.options.map((opt, i) => {
            const isCorrectOption = i === q.correctAnswer;
            const isUserPick = i === q.userAnswer;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-sm",
                  isCorrectOption && "border-green-500 bg-green-50 dark:bg-green-950/20",
                  isUserPick && !isCorrectOption && "border-red-500 bg-red-50 dark:bg-red-950/20",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                    isCorrectOption
                      ? "bg-green-500 text-white"
                      : isUserPick
                        ? "bg-red-500 text-white"
                        : "bg-muted",
                  )}
                >
                  {OPTION_LABELS[i]}
                </span>
                <span className="flex-1">{opt}</span>
                {isCorrectOption && <CheckCircle2 className="size-4 text-green-500" />}
                {isUserPick && !isCorrectOption && <XCircle className="size-4 text-red-500" />}
              </div>
            );
          })}
        </div>

        {q.explanation && (
          <div className="bg-muted/50 mt-4 rounded-lg p-3">
            <p className="text-muted-foreground text-xs font-semibold">Explanation</p>
            <p className="mt-1 text-sm">{q.explanation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
