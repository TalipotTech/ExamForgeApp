"use client";

import { useState } from "react";
import { X, Mic, Volume2, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useVoiceSession } from "@/lib/voice/use-voice-session";
import type { VoiceSessionMode } from "@/lib/voice/use-voice-session";
import { AudioWaveform } from "./audio-waveform";
import { VoiceControls } from "./voice-controls";

interface VoiceTutorOverlayProps {
  mode: VoiceSessionMode;
  examId: string;
  sessionId?: string;
  sourceUserExamId?: string;
  subject?: string;
  topic?: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  onClose: () => void;
}

export function VoiceTutorOverlay({
  mode,
  examId,
  sessionId: sourceSessionId,
  sourceUserExamId,
  subject,
  topic,
  questionCount = 10,
  difficulty = "mixed",
  onClose,
}: VoiceTutorOverlayProps): React.ReactElement {
  const [textInput, setTextInput] = useState("");
  const [sessionResult, setSessionResult] = useState<{
    score: number;
    totalQuestions: number;
    correctCount: number;
    weakAreas: string[];
  } | null>(null);

  const session = useVoiceSession({
    mode,
    examId,
    sourceSessionId,
    sourceUserExamId,
    subject,
    topic,
    questionCount,
    difficulty,
    onComplete: (result) => setSessionResult(result),
    onClose,
  });

  const currentQuestion = session.questions[session.currentQuestionIndex];
  const optionLabels = ["A", "B", "C", "D"];

  const stateColors: Record<string, string> = {
    speaking: "text-blue-500",
    listening: "text-green-500",
    processing: "text-yellow-500",
    correct: "text-green-600",
    wrong: "text-red-500",
    paused: "text-gray-500",
    complete: "text-primary",
  };

  const stateLabels: Record<string, string> = {
    idle: "Ready",
    speaking: "Reading question...",
    listening: "Listening...",
    processing: "Checking answer...",
    correct: "Correct!",
    wrong: "Incorrect",
    feedback: "Feedback",
    paused: "Paused",
    complete: "Session Complete",
  };

  function handleTextSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (textInput.trim()) {
      session.submitTextAnswer(textInput.trim());
      setTextInput("");
    }
  }

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Mic className="text-primary h-5 w-5" />
          <h2 className="text-lg font-semibold">Voice Exam Tutor</h2>
          <Badge variant="outline" className="text-xs capitalize">
            {mode.replace("_", " ")}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
        {/* Not started state */}
        {session.sessionState === "idle" && !session.isLoading && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Mic className="text-muted-foreground h-16 w-16" />
            <h3 className="text-xl font-semibold">
              {mode === "recap"
                ? "Voice Exam Recap"
                : mode === "teacher"
                  ? "AI Teacher Mode"
                  : "Voice Exam"}
            </h3>
            <p className="text-muted-foreground max-w-md">
              {mode === "recap"
                ? "I'll read through each question from your exam. Answer verbally and I'll give you feedback."
                : mode === "teacher"
                  ? "I'll quiz you conversationally, adapt difficulty based on your answers, and explain concepts in detail."
                  : `${questionCount} questions will be read aloud. Answer by saying the option letter or the answer text.`}
            </p>

            {!session.capabilities.ttsSupported && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-100 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4" />
                Text-to-speech not supported. Questions will be shown as text only.
              </div>
            )}

            {!session.capabilities.sttSupported && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-100 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4" />
                Speech recognition not supported. You can type your answers instead.
              </div>
            )}

            <Button size="lg" onClick={session.startSession} disabled={session.isLoading}>
              {session.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              Start Voice Session
            </Button>

            {session.error && <p className="text-sm text-red-500">{session.error}</p>}
          </div>
        )}

        {/* Loading */}
        {session.isLoading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Preparing voice session...</p>
          </div>
        )}

        {/* Active session */}
        {session.sessionState !== "idle" &&
          session.sessionState !== "complete" &&
          currentQuestion && (
            <div className="w-full max-w-2xl space-y-6">
              {/* Question Card */}
              <Card
                className={cn(
                  "transition-all",
                  session.sessionState === "correct" &&
                    "border-green-500 bg-green-50 dark:bg-green-950/20",
                  session.sessionState === "wrong" && "border-red-500 bg-red-50 dark:bg-red-950/20",
                )}
              >
                <CardContent className="p-6">
                  <div className="text-muted-foreground mb-3 text-sm">
                    Question {session.currentQuestionIndex + 1} of {session.questions.length}
                  </div>
                  <p className="mb-4 text-lg font-medium">{currentQuestion.question}</p>
                  <div className="space-y-2">
                    {currentQuestion.options.map((option, i) => {
                      const isCorrectAnswer = i === currentQuestion.correctAnswer;
                      const isUserAnswer =
                        session.lastResult &&
                        "selectedIndex" in session.lastResult &&
                        session.lastResult.selectedIndex === i;
                      const showResult =
                        session.sessionState === "correct" || session.sessionState === "wrong";

                      return (
                        <div
                          key={i}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm transition-all",
                            showResult &&
                              isCorrectAnswer &&
                              "border-green-500 bg-green-100 dark:bg-green-900/30",
                            showResult &&
                              isUserAnswer &&
                              !isCorrectAnswer &&
                              "border-red-500 bg-red-100 dark:bg-red-900/30",
                          )}
                        >
                          <span className="font-medium">{optionLabels[i]})</span> {option}
                          {showResult && isCorrectAnswer && (
                            <CheckCircle2 className="ml-2 inline h-4 w-4 text-green-600" />
                          )}
                          {showResult && isUserAnswer && !isCorrectAnswer && (
                            <XCircle className="ml-2 inline h-4 w-4 text-red-500" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Status & Waveform */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {session.sessionState === "listening" ? (
                      <Mic className="h-5 w-5 animate-pulse text-green-500" />
                    ) : session.sessionState === "speaking" ? (
                      <Volume2 className="h-5 w-5 text-blue-500" />
                    ) : session.sessionState === "processing" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
                    ) : null}
                    <span className={cn("text-sm font-medium", stateColors[session.sessionState])}>
                      {stateLabels[session.sessionState]}
                    </span>
                  </div>

                  <div className="mt-2">
                    <AudioWaveform
                      isActive={
                        session.sessionState === "listening" || session.sessionState === "speaking"
                      }
                      mode={session.sessionState === "listening" ? "input" : "output"}
                      className="w-full"
                    />
                  </div>

                  {session.lastTranscript && (
                    <p className="text-muted-foreground mt-2 text-sm">
                      Heard: &ldquo;{session.lastTranscript}&rdquo;
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Feedback */}
              {session.feedbackText &&
                (session.sessionState === "correct" ||
                  session.sessionState === "wrong" ||
                  session.sessionState === "feedback") && (
                  <Card
                    className={cn(
                      session.sessionState === "correct" ? "border-green-500" : "border-red-500",
                    )}
                  >
                    <CardContent className="p-4">
                      <p className="text-sm">{session.feedbackText}</p>
                    </CardContent>
                  </Card>
                )}

              {/* Text input fallback (for browsers without STT) */}
              {!session.capabilities.sttSupported && session.sessionState === "listening" && (
                <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                  <Input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type your answer (A, B, C, or D)..."
                    className="flex-1"
                    autoFocus
                  />
                  <Button type="submit" size="sm">
                    Submit
                  </Button>
                </form>
              )}

              {/* Also show text input as an option even with STT */}
              {session.capabilities.sttSupported && session.sessionState === "listening" && (
                <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                  <Input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Or type your answer here..."
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Submit
                  </Button>
                </form>
              )}

              {/* Quick answer buttons */}
              {session.sessionState === "listening" && (
                <div className="flex justify-center gap-2">
                  {optionLabels.map((label) => (
                    <Button
                      key={label}
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 text-lg font-bold"
                      onClick={() => session.submitTextAnswer(label)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Session complete */}
        {session.sessionState === "complete" && sessionResult && (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h3 className="text-2xl font-bold">Session Complete!</h3>
            <p className="text-primary text-4xl font-bold">
              {sessionResult.correctCount}/{sessionResult.totalQuestions}
            </p>
            <p className="text-muted-foreground">
              {sessionResult.score >= 80
                ? "Excellent work!"
                : sessionResult.score >= 50
                  ? "Good effort. Keep practicing!"
                  : "Don't worry, practice makes perfect."}
            </p>
            <p className="text-muted-foreground text-sm">
              Score: {Math.round(sessionResult.score)}%
            </p>

            {sessionResult.weakAreas.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-sm font-medium">Areas to improve:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {sessionResult.weakAreas.map((area) => (
                    <Badge key={area} variant="secondary">
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={onClose} className="mt-4">
              Close
            </Button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {session.sessionState !== "idle" && session.sessionState !== "complete" && (
        <VoiceControls
          state={session.sessionState}
          score={session.score}
          currentQuestion={session.currentQuestionIndex}
          totalQuestions={session.questions.length}
          onPause={session.pauseSession}
          onResume={session.resumeSession}
          onSkip={session.skipQuestion}
          onRepeat={session.repeatQuestion}
          onStop={session.stopSession}
        />
      )}
    </div>
  );
}
