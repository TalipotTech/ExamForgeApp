"use client";

import { useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useExamStore } from "@/stores/exam-store";
import { ExamTimer } from "@/components/exam/exam-timer";
import { QuestionNav } from "@/components/exam/question-nav";
import { QuestionDisplay } from "@/components/exam/question-display";
import { SubmitModal } from "@/components/exam/submit-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Send,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const AUTO_SAVE_INTERVAL_MS = 30_000;

export default function ExamTakePage(): React.ReactElement {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const {
    questions,
    currentIndex,
    answers,
    flagged,
    timeRemaining,
    isSubmitted,
    examName,
    setSession,
    goNext,
    goPrev,
    goToQuestion,
    selectAnswer,
    clearAnswer,
    toggleFlag,
    tick,
  } = useExamStore();

  const { data, isLoading, error } = trpc.examSession.getSession.useQuery(
    { sessionId },
    { enabled: !!sessionId, refetchOnWindowFocus: false },
  );

  const saveMutation = trpc.examSession.saveAnswers.useMutation({
    onError: () => toast.error("Failed to auto-save answers"),
  });

  const submitMutation = trpc.examSession.submit.useMutation({
    onSuccess: () => {
      useExamStore.getState().setSubmitted();
      router.push(`/results/${sessionId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // Initialize store from server data
  useEffect(() => {
    if (data && !data.completedAt) {
      setSession({
        sessionId: data.id,
        examName: data.examName,
        questions: data.questions,
        answers: data.answers,
        durationMinutes: data.durationMinutes,
        startedAt: data.startedAt,
      });
    }
    if (data?.completedAt) {
      router.replace(`/results/${sessionId}`);
    }
  }, [data, setSession, router, sessionId]);

  // Timer tick
  useEffect(() => {
    if (questions.length === 0 || isSubmitted) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [questions.length, isSubmitted, tick]);

  // Auto-submit when timer hits 0
  const autoSubmitTriggered = useRef(false);
  useEffect(() => {
    if (timeRemaining === 0 && questions.length > 0 && !isSubmitted && !autoSubmitTriggered.current) {
      autoSubmitTriggered.current = true;
      toast.warning("Time is up! Submitting your exam...");
      submitMutation.mutate({ sessionId, answers: useExamStore.getState().answers });
    }
  }, [timeRemaining, questions.length, isSubmitted, sessionId, submitMutation]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (questions.length === 0 || isSubmitted) return;
    const interval = setInterval(() => {
      const state = useExamStore.getState();
      saveMutation.mutate({
        sessionId,
        answers: state.answers,
        flagged: Array.from(state.flagged),
      });
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [questions.length, isSubmitted, sessionId, saveMutation]);

  // Browser close warning
  useEffect(() => {
    if (questions.length === 0 || isSubmitted) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [questions.length, isSubmitted]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (questions.length === 0 || isSubmitted) return;
      const current = questions[currentIndex];
      if (!current) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "a":
        case "A":
          if (current.type === "mcq") selectAnswer(current.id, 0);
          break;
        case "b":
        case "B":
          if (current.type === "mcq") selectAnswer(current.id, 1);
          break;
        case "c":
        case "C":
          if (current.type === "mcq") selectAnswer(current.id, 2);
          break;
        case "d":
        case "D":
          if (current.type === "mcq") selectAnswer(current.id, 3);
          break;
        case "f":
        case "F":
          toggleFlag(current.id);
          break;
      }
    },
    [questions, currentIndex, isSubmitted, goPrev, goNext, selectAnswer, toggleFlag],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleSubmit(): void {
    useExamStore.getState().setSubmitting(true);
    submitMutation.mutate({
      sessionId,
      answers: useExamStore.getState().answers,
    });
  }

  function handleExit(): void {
    const state = useExamStore.getState();
    saveMutation.mutate({
      sessionId,
      answers: state.answers,
      flagged: Array.from(state.flagged),
    });
    state.reset();
    router.push("/exams/start");
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full max-w-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">
            Failed to load exam session
          </p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" onClick={() => router.push("/exams/start")}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return <div />;

  const isFlagged = flagged.has(currentQuestion.id);
  const answeredCount = Object.keys(answers).length;
  const flaggedCount = flagged.size;

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <X className="size-4" />
                <span className="hidden sm:inline">Exit</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave exam?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your progress will be saved. You can resume later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Continue Exam</AlertDialogCancel>
                <AlertDialogAction onClick={handleExit}>
                  Leave
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <h1 className="text-sm font-medium sm:text-base">{examName}</h1>
        </div>
        <ExamTimer />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {answeredCount}/{questions.length} answered
          </span>
          {flaggedCount > 0 && (
            <span className="text-orange-500">{flaggedCount} flagged</span>
          )}
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question navigation sidebar (desktop) */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r p-4 lg:block">
          <QuestionNav
            questions={questions}
            currentIndex={currentIndex}
            answers={answers}
            flagged={flagged}
            onNavigate={goToQuestion}
          />
        </aside>

        {/* Question display area */}
        <main className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
            <QuestionDisplay
              question={currentQuestion}
              index={currentIndex}
              total={questions.length}
              selectedAnswer={answers[currentQuestion.id]}
              isFlagged={isFlagged}
              onSelectAnswer={(optionIndex) =>
                selectAnswer(currentQuestion.id, optionIndex)
              }
              onClearAnswer={() => clearAnswer(currentQuestion.id)}
              onToggleFlag={() => toggleFlag(currentQuestion.id)}
            />
          </div>

          {/* Bottom bar */}
          <div className="shrink-0 border-t bg-background px-4 py-3">
            {/* Mobile question nav */}
            <div className="mb-3 lg:hidden">
              <QuestionNav
                questions={questions}
                currentIndex={currentIndex}
                answers={answers}
                flagged={flagged}
                onNavigate={goToQuestion}
                compact
              />
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant={isFlagged ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleFlag(currentQuestion.id)}
                >
                  <Flag
                    className={`size-4 ${isFlagged ? "fill-orange-500 text-orange-500" : ""}`}
                  />
                  <span className="hidden sm:inline">Flag</span>
                </Button>

                <SubmitModal
                  answeredCount={answeredCount}
                  totalCount={questions.length}
                  flaggedCount={flaggedCount}
                  onSubmit={handleSubmit}
                  isPending={submitMutation.isPending}
                >
                  <Button variant="default" size="sm">
                    <Send className="size-4" />
                    Submit
                  </Button>
                </SubmitModal>
              </div>

              <Button
                variant="outline"
                onClick={goNext}
                disabled={currentIndex === questions.length - 1}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
