"use client";

import { useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { usePracticeExamStore } from "@/stores/practice-exam-store";
import { QuestionNav } from "@/components/exam/question-nav";
import { QuestionDisplay } from "@/components/exam/question-display";
import { SubmitModal } from "@/components/exam/submit-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Clock,
  FileQuestion,
  Play,
  Square,
  RotateCcw,
  ListChecks,
  AlertTriangle,
  Zap,
  Trophy,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExamQuestion } from "@/stores/exam-store";

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function PracticeExamPage(): React.ReactElement {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const examId = Number(params.examId);

  const {
    questions: practiceQuestions,
    currentIndex,
    answers,
    flagged,
    timeRemaining,
    durationMinutes,
    examTitle,
    examStatus,
    setSession,
    startExam,
    stopExam,
    goNext,
    goPrev,
    goToQuestion,
    selectAnswer,
    clearAnswer,
    toggleFlag,
    tick,
    isSubmitting,
    setSubmitting,
    setSubmitted,
    reset,
  } = usePracticeExamStore();

  const { data, isLoading, error } = trpc.tutorialAgent.startUserExam.useQuery(
    { id: examId },
    { enabled: !!examId, refetchOnWindowFocus: false },
  );

  const quotaQuery = trpc.tutorialAgent.getExamQuota.useQuery(undefined, {
    staleTime: 30_000,
  });

  const submitMutation = trpc.tutorialAgent.submitUserExam.useMutation({
    onSuccess: (result) => {
      setSubmitted();
      // Store result in session storage for the results page
      sessionStorage.setItem(`practice-result-${examId}`, JSON.stringify(result));
      router.push(`/dashboard/my-exams/results/${examId}` as "/");
    },
    onError: (err) => {
      toast.error(err.message);
      setSubmitting(false);
    },
  });

  // Initialize store from server data
  useEffect(() => {
    if (data) {
      setSession({
        examId: data.id,
        examTitle: data.title,
        questions: data.questions,
        durationMinutes: data.timeLimitMinutes,
        startedAt: data.startedAt,
      });
    }
  }, [data, setSession]);

  // Timer — only tick when exam is running
  useEffect(() => {
    if (examStatus !== "running" || practiceQuestions.length === 0) return;
    const interval = setInterval(() => tick(), 1000);
    return () => clearInterval(interval);
  }, [examStatus, practiceQuestions.length, tick]);

  // Auto-submit on time expiry
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (
      timeRemaining === 0 &&
      examStatus === "running" &&
      practiceQuestions.length > 0 &&
      !autoSubmitRef.current
    ) {
      autoSubmitRef.current = true;
      handleSubmit();
    }
  }, [timeRemaining, examStatus, practiceQuestions.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const startedAtRef = useRef<Date | null>(null);
  useEffect(() => {
    if (examStatus === "running") {
      startedAtRef.current = new Date();
    }
  }, [examStatus]);

  const handleSubmit = useCallback((): void => {
    setSubmitting(true);
    const timeTaken = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current.getTime()) / 1000)
      : 0;
    submitMutation.mutate({
      id: examId,
      answers,
      timeTakenSeconds: timeTaken,
    });
  }, [examId, answers, submitMutation, setSubmitting]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Skeleton className="mb-4 h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg">{error.message}</p>
          <Button className="mt-4" onClick={() => router.push("/dashboard/my-exams")}>
            Back to My Exams
          </Button>
        </div>
      </div>
    );
  }

  if (practiceQuestions.length === 0) {
    // Show "No Questions" ONLY when data confirms the exam has 0 valid questions
    if (data && data.questions.length === 0) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <FileQuestion className="text-muted-foreground h-16 w-16" />
          <h2 className="text-lg font-semibold">No Questions Available</h2>
          <p className="text-muted-foreground max-w-md text-center text-sm">
            This exam doesn&apos;t have any valid questions. This can happen if the questions
            weren&apos;t generated properly. Try generating a new exam.
          </p>
          <Button onClick={() => router.push("/dashboard/my-exams")}>Back to My Exams</Button>
        </div>
      );
    }
    // Otherwise: store is still initializing from server data — show loading
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Skeleton className="mb-4 h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Transform practice questions to ExamQuestion shape for QuestionDisplay
  const examQuestions: ExamQuestion[] = practiceQuestions
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      id: q.id,
      type: "mcq",
      content: {
        question: q.question,
        options: q.options,
      },
      subject: q.subject,
      topic: null,
    }));

  // ─── Ready state: show exam info + Start button ───
  if (examStatus === "ready") {
    const attempts = data?.timesAttempted ?? 0;
    const bestScore = data?.bestScore ?? 0;
    const quota = quotaQuery.data;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="bg-primary/10 mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
              <FileQuestion className="text-primary size-8" />
            </div>
            <CardTitle className="text-2xl">{examTitle}</CardTitle>
            {/* Attempt & score badges */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {attempts > 0 ? (
                <>
                  <Badge variant="secondary" className="gap-1">
                    <Play className="size-3" />
                    {attempts} attempt{attempts !== 1 ? "s" : ""}
                  </Badge>
                  {bestScore > 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1",
                        bestScore >= 80
                          ? "border-green-500 text-green-700 dark:text-green-300"
                          : bestScore >= 60
                            ? "border-amber-500 text-amber-700 dark:text-amber-300"
                            : "border-red-500 text-red-700 dark:text-red-300",
                      )}
                    >
                      <Trophy className="size-3" />
                      Best: {Math.round(bestScore)}%
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not attempted yet
                </Badge>
              )}
              {quota && (
                <Badge
                  variant={quota.used >= quota.limit ? "destructive" : "secondary"}
                  className="gap-1"
                >
                  <Zap className="size-3" />
                  {quota.used}/{quota.limit} generated ({quota.planName})
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
                <ListChecks className="text-muted-foreground size-5" />
                <span className="text-2xl font-bold">{examQuestions.length}</span>
                <span className="text-muted-foreground text-xs">Questions</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
                <Clock className="text-muted-foreground size-5" />
                <span className="text-2xl font-bold">{durationMinutes}</span>
                <span className="text-muted-foreground text-xs">Minutes</span>
              </div>
            </div>

            <div className="bg-muted/50 text-muted-foreground rounded-lg p-4 text-sm">
              <ul className="space-y-1.5">
                <li>&#8226; You have {durationMinutes} minutes to complete the exam</li>
                <li>&#8226; You can flag questions to review later</li>
                <li>&#8226; The exam auto-submits when time runs out</li>
                <li>&#8226; Stopping the exam will require a full retake</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <Button size="lg" className="w-full gap-2 text-base" onClick={startExam}>
                <Play className="size-5" />
                {attempts > 0 ? "Retake Exam" : "Start Exam"}
              </Button>
              <Link
                href={
                  data?.examId
                    ? (`/dashboard/voice-exam?examId=${data.examId}` as "/")
                    : ("/dashboard/voice-exam" as "/")
                }
                className="w-full"
              >
                <Button variant="outline" size="lg" className="w-full gap-2">
                  <Mic className="size-4" />
                  Take as Voice Exam
                </Button>
              </Link>
              <Link href="/dashboard/my-exams" className="w-full">
                <Button variant="outline" size="lg" className="w-full gap-2">
                  <ListChecks className="size-4" />
                  My Exams
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Stopped state: show stopped message + Retake/My Exams ───
  if (examStatus === "stopped") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/30">
              <AlertTriangle className="size-8 text-orange-500" />
            </div>
            <CardTitle className="text-2xl">Exam Stopped</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-center">
              You stopped the exam before completing it. Your progress has not been saved. To take
              this exam, you&apos;ll need to start over.
            </p>

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  Answered {Object.keys(answers).length} of {examQuestions.length} questions before
                  stopping.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full gap-2 text-base"
                onClick={() => {
                  reset();
                  // Re-trigger by setting session from existing data
                  if (data) {
                    setSession({
                      examId: data.id,
                      examTitle: data.title,
                      questions: data.questions,
                      durationMinutes: data.timeLimitMinutes,
                      startedAt: data.startedAt,
                    });
                  }
                }}
              >
                <RotateCcw className="size-5" />
                Retake Exam
              </Button>
              <Link href="/dashboard/my-exams" className="w-full">
                <Button variant="outline" size="lg" className="w-full gap-2">
                  <ListChecks className="size-4" />
                  My Exams
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Running state: the actual exam UI ───
  const currentQuestion = examQuestions[currentIndex];
  if (!currentQuestion) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <FileQuestion className="text-muted-foreground h-16 w-16" />
        <h2 className="text-lg font-semibold">Question Not Found</h2>
        <p className="text-muted-foreground text-sm">Unable to load the current question.</p>
        <Button onClick={() => router.push("/dashboard/my-exams")}>Back to My Exams</Button>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const flaggedCount = flagged.size;
  const totalSeconds = durationMinutes * 60;
  const timerProgress = totalSeconds > 0 ? (timeRemaining / totalSeconds) * 100 : 0;
  const isTimeLow = timeRemaining < 300;
  const isTimeCritical = timeRemaining < 60;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="bg-background/95 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <h1 className="truncate text-sm font-semibold sm:text-base">{examTitle}</h1>
          <div className="flex items-center gap-3">
            {/* Timer */}
            <div className="flex items-center gap-2">
              <Clock
                className={cn(
                  "size-4",
                  isTimeCritical
                    ? "animate-pulse text-red-500"
                    : isTimeLow
                      ? "text-orange-500"
                      : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "min-w-[4rem] text-center font-mono text-sm font-semibold",
                  isTimeCritical ? "text-red-500" : isTimeLow ? "text-orange-500" : "",
                )}
              >
                {formatTime(timeRemaining)}
              </span>
              <Progress
                value={timerProgress}
                className={cn(
                  "hidden h-2 w-24 sm:block",
                  isTimeCritical ? "[&>div]:bg-red-500" : isTimeLow ? "[&>div]:bg-orange-500" : "",
                )}
              />
            </div>

            {/* Stop button */}
            <Button variant="destructive" size="sm" className="gap-1" onClick={stopExam}>
              <Square className="size-3.5" />
              Stop
            </Button>

            {/* Submit button */}
            <SubmitModal
              answeredCount={answeredCount}
              totalCount={practiceQuestions.length}
              flaggedCount={flaggedCount}
              onSubmit={handleSubmit}
              isPending={isSubmitting}
            >
              <Button size="sm" className="gap-1">
                <Send className="size-3.5" />
                Submit
              </Button>
            </SubmitModal>

            {/* My Exams — disabled during running exam */}
            <Link
              href="/dashboard/my-exams"
              aria-disabled="true"
              tabIndex={-1}
              className="pointer-events-none"
            >
              <Button variant="outline" size="sm" className="gap-1" disabled>
                <ListChecks className="size-3.5" />
                <span className="hidden sm:inline">My Exams</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile question nav */}
      <div className="border-b px-4 py-2 lg:hidden">
        <QuestionNav
          questions={examQuestions}
          currentIndex={currentIndex}
          answers={answers}
          flagged={flagged}
          onNavigate={goToQuestion}
          compact
        />
      </div>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6">
        {/* Sidebar nav (desktop) */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-20">
            <QuestionNav
              questions={examQuestions}
              currentIndex={currentIndex}
              answers={answers}
              flagged={flagged}
              onNavigate={goToQuestion}
            />
          </div>
        </aside>

        {/* Main question */}
        <main className="flex-1">
          <div className="mx-auto max-w-2xl">
            <QuestionDisplay
              question={currentQuestion}
              index={currentIndex}
              total={practiceQuestions.length}
              selectedAnswer={answers[currentQuestion.id]}
              isFlagged={flagged.has(currentQuestion.id)}
              onSelectAnswer={(i) => selectAnswer(currentQuestion.id, i)}
              onClearAnswer={() => clearAnswer(currentQuestion.id)}
              onToggleFlag={() => toggleFlag(currentQuestion.id)}
            />

            {/* Nav buttons */}
            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="gap-1"
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>

              <span className="text-muted-foreground text-xs">
                {answeredCount} / {practiceQuestions.length} answered
              </span>

              {currentIndex < practiceQuestions.length - 1 ? (
                <Button onClick={goNext} className="gap-1">
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              ) : (
                <SubmitModal
                  answeredCount={answeredCount}
                  totalCount={practiceQuestions.length}
                  flaggedCount={flaggedCount}
                  onSubmit={handleSubmit}
                  isPending={isSubmitting}
                >
                  <Button className="gap-1">
                    <Send className="size-3.5" />
                    Submit
                  </Button>
                </SubmitModal>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
