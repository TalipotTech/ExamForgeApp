"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Mic,
  Volume2,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  SkipForward,
  RotateCcw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "./audio-waveform";
import { matchSpokenAnswer } from "@/lib/voice/answer-matcher";
import { BrowserVoiceService } from "@/lib/voice/browser-voice";
import { PremiumVoiceService } from "@/lib/voice/premium-voice";
import { detectVoiceCapabilities } from "@/lib/voice/voice-service";
import type { VoiceService } from "@/lib/voice/voice-service";
import { trpc } from "@/lib/trpc";

export type RecapQuestion = {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  subject?: string;
  difficulty?: string;
};

interface VoiceRecapOverlayProps {
  questions: RecapQuestion[];
  title?: string;
  onClose: () => void;
}

type RecapState = "idle" | "speaking" | "listening" | "correct" | "wrong" | "paused" | "complete";

export function VoiceRecapOverlay({
  questions,
  title,
  onClose,
}: VoiceRecapOverlayProps): React.ReactElement {
  const [state, setState] = useState<RecapState>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [transcript, setTranscript] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [textInput, setTextInput] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [capabilities] = useState(() => detectVoiceCapabilities());
  const [browserVoices, setBrowserVoices] = useState<
    Array<{ name: string; lang: string; uri: string }>
  >([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<"browser" | "premium">("browser");
  const voiceRef = useRef<VoiceService | null>(null);
  const browserVoiceRef = useRef<BrowserVoiceService | null>(null);
  const startTimeRef = useRef(Date.now());

  const currentQuestion = questions[currentIndex];
  const optionLabels = ["A", "B", "C", "D"];

  // Fetch premium voices from server
  const premiumQuery = trpc.voiceTutor.getAvailableVoices.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const synthesizeMutation = trpc.voiceTutor.synthesize.useMutation();

  const premiumVoices = premiumQuery.data?.premiumVoices ?? [];
  const premiumEnabled = premiumQuery.data?.premiumEnabled ?? false;
  const userUsage = premiumQuery.data?.userUsage;

  // Init browser voice service (once on mount)
  useEffect(() => {
    if (capabilities.ttsSupported || capabilities.sttSupported) {
      const svc = new BrowserVoiceService();
      // Only set voiceRef if no premium service is already active
      if (!voiceRef.current) {
        voiceRef.current = svc;
      }
      browserVoiceRef.current = svc;

      const loadVoices = (): void => {
        const voices = svc.getEnglishVoices();
        if (voices.length > 0) {
          setBrowserVoices(voices);
          const current = svc.getSelectedVoiceName();
          if (current) setSelectedVoice((prev) => prev || current);
        }
      };
      loadVoices();
      const timer = setTimeout(loadVoices, 500);
      window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);

      return (): void => {
        clearTimeout(timer);
        window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
        svc.dispose();
      };
    }
    return undefined;
  }, [capabilities]); // intentionally omit selectedVoice to avoid overwriting premium voice service

  const speakQuestion = useCallback(
    async (index: number): Promise<void> => {
      const q = questions[index];
      if (!q) return;

      setState("speaking");
      setSelectedAnswer(null);
      setFeedbackText("");
      setTranscript("");

      if (voiceRef.current) {
        const text = `Question ${index + 1} of ${questions.length}. ${q.question}. ${q.options.map((opt, i) => `${optionLabels[i]}) ${opt}`).join(". ")}. What's your answer?`;
        await voiceRef.current.speak(text);
      }

      setState("listening");

      // Start listening
      if (voiceRef.current && capabilities.sttSupported) {
        voiceRef.current.startListening({ timeout: 15000 });
      }
    },
    [questions, capabilities.sttSupported],
  );

  const processAnswer = useCallback(
    async (answerText: string): Promise<void> => {
      const q = questions[currentIndex];
      if (!q) return;

      const result = matchSpokenAnswer(answerText, q.options, q.correctAnswer);
      setTranscript(answerText);

      if (result.matched && "isCommand" in result && result.isCommand) {
        switch (result.command) {
          case "skip":
          case "next":
            if (currentIndex < questions.length - 1) {
              setCurrentIndex((i) => i + 1);
              setTimeout(() => speakQuestion(currentIndex + 1), 500);
            } else {
              setState("complete");
            }
            return;
          case "repeat":
            speakQuestion(currentIndex);
            return;
          case "stop":
          case "end":
            setState("complete");
            return;
          case "explain":
          case "more":
            if (q.explanation && voiceRef.current) {
              await voiceRef.current.speak(q.explanation);
              setState("listening");
              if (capabilities.sttSupported) {
                voiceRef.current.startListening({ timeout: 15000 });
              }
            }
            return;
          default:
            break;
        }
      }

      if (result.matched && !("isCommand" in result && result.isCommand)) {
        setSelectedAnswer(result.selectedIndex);
        const isCorrect = result.isCorrect;

        if (isCorrect) {
          setState("correct");
          setScore((s) => ({ correct: s.correct + 1, answered: s.answered + 1 }));
          setFeedbackText(`Correct! ${q.explanation ?? ""}`);
          if (voiceRef.current) await voiceRef.current.speak("Correct!");
        } else {
          setState("wrong");
          setScore((s) => ({ ...s, answered: s.answered + 1 }));
          setFeedbackText(
            `The correct answer is ${optionLabels[q.correctAnswer]}. ${q.explanation ?? ""}`,
          );
          if (voiceRef.current) {
            await voiceRef.current.speak(`The correct answer is ${optionLabels[q.correctAnswer]}.`);
          }
        }

        // Move to next after a pause
        setTimeout(() => {
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((i) => i + 1);
            setTimeout(() => speakQuestion(currentIndex + 1), 500);
          } else {
            setState("complete");
          }
        }, 2000);
      } else {
        // No match
        if (voiceRef.current) {
          await voiceRef.current.speak("I didn't catch that. Say A, B, C, or D.");
          setState("listening");
          if (capabilities.sttSupported) {
            voiceRef.current.startListening({ timeout: 15000 });
          }
        }
      }
    },
    [questions, currentIndex, capabilities.sttSupported, speakQuestion],
  );

  // Set up voice recognition
  useEffect(() => {
    const voice = voiceRef.current;
    if (!voice) return;

    voice.onResult((text, isFinal) => {
      if (isFinal) {
        processAnswer(text);
      } else {
        setTranscript(text);
      }
    });

    voice.onError((err) => {
      if (err === "timeout" && state === "listening" && voiceRef.current) {
        voiceRef.current.speak("Say your answer or say skip.");
        if (capabilities.sttSupported) {
          voiceRef.current.startListening({ timeout: 15000 });
        }
      }
    });
  }, [processAnswer, state, capabilities.sttSupported]);

  function handleTextSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (textInput.trim()) {
      processAnswer(textInput.trim());
      setTextInput("");
    }
  }

  function handleStart(): void {
    startTimeRef.current = Date.now();
    speakQuestion(0);
  }

  function handleClose(): void {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    voiceRef.current?.dispose();
    voiceRef.current = null;
    browserVoiceRef.current = null;
    onClose();
  }

  function handlePause(): void {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    setState("paused");
  }

  function handleResume(): void {
    speakQuestion(currentIndex);
  }

  function handleSkip(): void {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setTimeout(() => speakQuestion(currentIndex + 1), 500);
    } else {
      setState("complete");
    }
  }

  function handleRepeat(): void {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    speakQuestion(currentIndex);
  }

  function handleStop(): void {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    setState("complete");
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (state === "paused") handleResume();
          else if (state !== "complete" && state !== "idle") handlePause();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSkip();
          break;
        case "r":
        case "R":
          e.preventDefault();
          handleRepeat();
          break;
        case "Escape":
          e.preventDefault();
          handleStop();
          break;
      }
    }

    window.addEventListener("keydown", handleKey);
    return (): void => window.removeEventListener("keydown", handleKey);
  });

  const scorePercent = score.answered > 0 ? Math.round((score.correct / score.answered) * 100) : 0;

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Mic className="text-primary h-5 w-5" />
          <h2 className="text-lg font-semibold">Voice Recap</h2>
          {title && (
            <Badge variant="outline" className="text-xs">
              {title}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
        {/* Idle — Start */}
        {state === "idle" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Mic className="text-muted-foreground h-16 w-16" />
            <h3 className="text-xl font-semibold">Voice Exam Recap</h3>
            <p className="text-muted-foreground max-w-md">
              I&apos;ll read through {questions.length} questions from your exam. Answer verbally or
              click A/B/C/D. Say &ldquo;skip&rdquo; to move on or &ldquo;explain&rdquo; for details.
            </p>

            {/* Voice selector */}
            <div className="w-full max-w-xs space-y-2">
              <Label className="text-sm">Voice</Label>
              <Select
                value={`${selectedProvider}:${selectedVoice}`}
                onValueChange={(val) => {
                  const [provider, ...nameParts] = val.split(":");
                  const name = nameParts.join(":");
                  if (provider === "premium") {
                    setSelectedProvider("premium");
                    setSelectedVoice(name);
                    // Switch to premium voice service
                    const premiumSvc = new PremiumVoiceService(
                      name,
                      async (text, voiceId, rate) => {
                        const res = await synthesizeMutation.mutateAsync({ text, voiceId, rate });
                        return { audioBase64: res.audioBase64, contentType: res.contentType };
                      },
                    );
                    voiceRef.current?.dispose();
                    voiceRef.current = premiumSvc;
                    // Preview
                    premiumSvc.speak("Hello, I am your exam tutor.", { rate: 0.9 });
                  } else {
                    setSelectedProvider("browser");
                    setSelectedVoice(name);
                    // Reuse existing browser service (voices already loaded)
                    const browserSvc = browserVoiceRef.current ?? new BrowserVoiceService();
                    browserSvc.setVoiceByName(name);
                    // Dispose premium service if switching away from it
                    if (voiceRef.current && voiceRef.current !== browserSvc) {
                      voiceRef.current.dispose();
                    }
                    voiceRef.current = browserSvc;
                    browserVoiceRef.current = browserSvc;
                    browserSvc.speak("Hello, I am your exam tutor.", { rate: 0.9 });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {premiumEnabled && premiumVoices.length > 0 && (
                    <>
                      <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                        Premium Voices (Azure)
                      </div>
                      {premiumVoices.map((v) => (
                        <SelectItem key={`premium:${v.id}`} value={`premium:${v.id}`}>
                          {v.name}
                        </SelectItem>
                      ))}
                      <div className="my-1 border-t" />
                    </>
                  )}
                  <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                    Browser Voices
                  </div>
                  {browserVoices.map((v) => (
                    <SelectItem key={`browser:${v.name}`} value={`browser:${v.name}`}>
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {premiumEnabled && userUsage && (
                <p className="text-muted-foreground text-xs">
                  Premium usage: {userUsage.used.toLocaleString()} /{" "}
                  {userUsage.limit.toLocaleString()} chars this month
                </p>
              )}
              {!premiumEnabled && (
                <p className="text-muted-foreground text-xs">
                  Pick an English voice. Indian English (en-IN) recommended.
                </p>
              )}
            </div>

            <Button size="lg" onClick={handleStart}>
              <Mic className="mr-2 h-4 w-4" />
              Start Voice Recap
            </Button>
          </div>
        )}

        {/* Active session */}
        {state !== "idle" && state !== "complete" && currentQuestion && (
          <div className="w-full max-w-2xl space-y-6">
            {/* Question Card */}
            <Card
              className={cn(
                "transition-all",
                state === "correct" && "border-green-500 bg-green-50 dark:bg-green-950/20",
                state === "wrong" && "border-red-500 bg-red-50 dark:bg-red-950/20",
              )}
            >
              <CardContent className="p-6">
                <div className="text-muted-foreground mb-3 text-sm">
                  Question {currentIndex + 1} of {questions.length}
                  {currentQuestion.subject && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {currentQuestion.subject}
                    </Badge>
                  )}
                </div>
                <p className="mb-4 text-lg font-medium">{currentQuestion.question}</p>
                <div className="space-y-2">
                  {currentQuestion.options.map((option, i) => {
                    const isCorrectOpt = i === currentQuestion.correctAnswer;
                    const isUserPick = selectedAnswer === i;
                    const showResult = state === "correct" || state === "wrong";

                    return (
                      <button
                        key={i}
                        className={cn(
                          "hover:bg-muted/50 w-full rounded-lg border px-4 py-2 text-left text-sm transition-all",
                          showResult &&
                            isCorrectOpt &&
                            "border-green-500 bg-green-100 dark:bg-green-900/30",
                          showResult &&
                            isUserPick &&
                            !isCorrectOpt &&
                            "border-red-500 bg-red-100 dark:bg-red-900/30",
                          state === "listening" && "hover:border-primary cursor-pointer",
                        )}
                        onClick={() => state === "listening" && processAnswer(optionLabels[i])}
                        disabled={state !== "listening"}
                      >
                        <span className="font-medium">{optionLabels[i]})</span> {option}
                        {showResult && isCorrectOpt && (
                          <CheckCircle2 className="ml-2 inline h-4 w-4 text-green-600" />
                        )}
                        {showResult && isUserPick && !isCorrectOpt && (
                          <XCircle className="ml-2 inline h-4 w-4 text-red-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {state === "listening" ? (
                    <Mic className="h-5 w-5 animate-pulse text-green-500" />
                  ) : state === "speaking" ? (
                    <Volume2 className="h-5 w-5 text-blue-500" />
                  ) : null}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      state === "speaking" && "text-blue-500",
                      state === "listening" && "text-green-500",
                      state === "correct" && "text-green-600",
                      state === "wrong" && "text-red-500",
                      state === "paused" && "text-gray-500",
                    )}
                  >
                    {state === "speaking" && "Reading question..."}
                    {state === "listening" && "Listening..."}
                    {state === "correct" && "Correct!"}
                    {state === "wrong" && "Incorrect"}
                    {state === "paused" && "Paused"}
                  </span>
                </div>
                <div className="mt-2">
                  <AudioWaveform
                    isActive={state === "listening" || state === "speaking"}
                    mode={state === "listening" ? "input" : "output"}
                    className="w-full"
                  />
                </div>
                {transcript && (
                  <p className="text-muted-foreground mt-2 text-sm">
                    Heard: &ldquo;{transcript}&rdquo;
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Feedback */}
            {feedbackText && (state === "correct" || state === "wrong") && (
              <Card className={state === "correct" ? "border-green-500" : "border-red-500"}>
                <CardContent className="p-4">
                  <p className="text-sm">{feedbackText}</p>
                </CardContent>
              </Card>
            )}

            {/* Text input */}
            {state === "listening" && (
              <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type your answer (A, B, C, or D)..."
                  className="flex-1"
                />
                <Button type="submit" size="sm">
                  Submit
                </Button>
              </form>
            )}

            {/* Quick answer buttons */}
            {state === "listening" && (
              <div className="flex justify-center gap-2">
                {optionLabels.map((label) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="lg"
                    className="h-12 w-12 text-lg font-bold"
                    onClick={() => processAnswer(label)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Complete */}
        {state === "complete" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h3 className="text-2xl font-bold">Recap Complete!</h3>
            <p className="text-primary text-4xl font-bold">
              {score.correct}/{score.answered}
            </p>
            <p className="text-muted-foreground">
              {scorePercent >= 80
                ? "Excellent work!"
                : scorePercent >= 50
                  ? "Good effort. Keep practicing!"
                  : "Keep practicing, you'll get there!"}
            </p>
            <p className="text-muted-foreground text-sm">Score: {scorePercent}%</p>
            <Button onClick={handleClose} className="mt-4">
              Close
            </Button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {state !== "idle" && state !== "complete" && (
        <div className="bg-card border-t p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Score: {score.correct}/{score.answered} ({scorePercent}%)
            </span>
            <span className="text-muted-foreground">
              Q {currentIndex + 1}/{questions.length}
            </span>
          </div>
          <div className="bg-muted mb-4 h-1.5 w-full rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={state === "paused" ? handleResume : handlePause}
              disabled={state === "correct" || state === "wrong"}
            >
              {state === "paused" ? (
                <Play className="mr-1 h-4 w-4" />
              ) : (
                <Pause className="mr-1 h-4 w-4" />
              )}
              {state === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSkip} disabled={state === "paused"}>
              <SkipForward className="mr-1 h-4 w-4" />
              Skip
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRepeat}
              disabled={state === "paused"}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Repeat
            </Button>
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="mr-1 h-4 w-4" />
              Stop
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-center text-xs">
            Space: Pause/Resume | Right Arrow: Skip | R: Repeat | Esc: Stop
          </p>
        </div>
      )}
    </div>
  );
}
