"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { BrowserVoiceService } from "./browser-voice";
import { detectVoiceCapabilities } from "./voice-service";
import type { VoiceService, VoiceCapabilities } from "./voice-service";
import { VoiceSessionStateMachine } from "./session-state-machine";
import type { VoiceSessionState } from "./session-state-machine";
import { matchSpokenAnswer } from "./answer-matcher";
import type { AnswerMatchResult } from "./answer-matcher";
import { trpc } from "@/lib/trpc";

export type VoiceSessionMode = "recap" | "fresh_exam" | "teacher";

type VoiceQuestion = {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  subject?: string;
};

type VoiceSessionConfig = {
  mode: VoiceSessionMode;
  examId: string;
  sourceSessionId?: string;
  sourceUserExamId?: string;
  subject?: string;
  topic?: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  onComplete?: (result: {
    score: number;
    totalQuestions: number;
    correctCount: number;
    weakAreas: string[];
  }) => void;
  onClose?: () => void;
};

export type UseVoiceSessionReturn = {
  // State
  sessionState: VoiceSessionState;
  currentQuestionIndex: number;
  questions: VoiceQuestion[];
  score: { correct: number; total: number; answered: number };
  lastTranscript: string;
  lastResult: AnswerMatchResult | null;
  feedbackText: string;
  isLoading: boolean;
  sessionId: string | null;
  error: string | null;
  capabilities: VoiceCapabilities;

  // Actions
  startSession: () => Promise<void>;
  skipQuestion: () => void;
  repeatQuestion: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  stopSession: () => void;
  submitTextAnswer: (text: string) => void;
};

export function useVoiceSession(config: VoiceSessionConfig): UseVoiceSessionReturn {
  const [sessionState, setSessionState] = useState<VoiceSessionState>("idle");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [voiceQuestions, setVoiceQuestions] = useState<VoiceQuestion[]>([]);
  const [score, setScore] = useState({ correct: 0, total: 0, answered: 0 });
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastResult, setLastResult] = useState<AnswerMatchResult | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capabilities] = useState(() => detectVoiceCapabilities());

  const voiceRef = useRef<VoiceService | null>(null);
  const smRef = useRef(new VoiceSessionStateMachine());
  const startTimeRef = useRef<number>(0);
  const answerStartRef = useRef<number>(0);

  const startSessionMutation = trpc.voiceTutor.startSession.useMutation();
  const submitAnswerMutation = trpc.voiceTutor.submitAnswer.useMutation();
  const completeSessionMutation = trpc.voiceTutor.completeSession.useMutation();

  // Initialize voice service
  useEffect(() => {
    if (capabilities.ttsSupported || capabilities.sttSupported) {
      voiceRef.current = new BrowserVoiceService();
    }
    return (): void => {
      voiceRef.current?.dispose();
    };
  }, [capabilities]);

  const updateState = useCallback((newState: VoiceSessionState): void => {
    setSessionState(newState);
  }, []);

  // Subscribe to state machine changes
  useEffect(() => {
    const unsub = smRef.current.onStateChange((newState) => {
      updateState(newState);
    });
    return unsub;
  }, [updateState]);

  const speakQuestion = useCallback(
    async (index: number): Promise<void> => {
      const q = voiceQuestions[index];
      if (!q || !voiceRef.current) return;

      smRef.current.transition({ type: "START" });

      const optionLabels = ["A", "B", "C", "D"];
      const questionText = `Question ${index + 1} of ${voiceQuestions.length}. ${q.question}. ${q.options.map((opt, i) => `${optionLabels[i]}) ${opt}`).join(". ")}. What's your answer?`;

      await voiceRef.current.speak(questionText);
      smRef.current.transition({ type: "SPEECH_END" });

      // Start listening
      answerStartRef.current = Date.now();
      voiceRef.current.startListening({ timeout: 15000 });
    },
    [voiceQuestions],
  );

  const handleAnswer = useCallback(
    async (transcript: string): Promise<void> => {
      const q = voiceQuestions[currentQuestionIndex];
      if (!q || !sessionId) return;

      smRef.current.transition({ type: "USER_SPOKE", transcript });
      setLastTranscript(transcript);

      const result = matchSpokenAnswer(transcript, q.options, q.correctAnswer);
      setLastResult(result);

      if (result.matched && "isCommand" in result && result.isCommand) {
        // Handle voice commands
        switch (result.command) {
          case "skip":
          case "next":
            smRef.current.transition({ type: "SKIP" });
            if (currentQuestionIndex < voiceQuestions.length - 1) {
              setCurrentQuestionIndex((i) => i + 1);
              setTimeout(() => speakQuestion(currentQuestionIndex + 1), 500);
            } else {
              smRef.current.transition({ type: "SESSION_COMPLETE" });
            }
            return;
          case "repeat":
            smRef.current.transition({ type: "REPEAT" });
            setTimeout(() => speakQuestion(currentQuestionIndex), 500);
            return;
          case "stop":
          case "end":
            smRef.current.transition({ type: "STOP" });
            return;
          case "pause":
            smRef.current.transition({ type: "PAUSE" });
            return;
          case "explain":
          case "more":
            if (q.explanation && voiceRef.current) {
              await voiceRef.current.speak(q.explanation);
            }
            return;
          default:
            break;
        }
      }

      if (result.matched && !("isCommand" in result && result.isCommand)) {
        const responseTimeMs = Date.now() - answerStartRef.current;

        try {
          const serverResult = await submitAnswerMutation.mutateAsync({
            sessionId,
            questionIndex: currentQuestionIndex,
            selectedIndex: result.selectedIndex,
            spokenTranscript: transcript,
            responseTimeMs,
          });

          if (serverResult.isCorrect) {
            smRef.current.transition({ type: "ANSWER_CORRECT" });
            setScore((s) => ({
              ...s,
              correct: s.correct + 1,
              answered: s.answered + 1,
            }));
            setFeedbackText(`Correct! ${serverResult.explanation}`);
          } else {
            smRef.current.transition({ type: "ANSWER_WRONG" });
            setScore((s) => ({ ...s, answered: s.answered + 1 }));
            const optionLabels = ["A", "B", "C", "D"];
            setFeedbackText(
              `Not quite. The correct answer is ${optionLabels[serverResult.correctIndex]}. ${serverResult.explanation}`,
            );
          }

          // Speak feedback
          if (voiceRef.current) {
            const fbText = serverResult.isCorrect
              ? `Correct!`
              : `The correct answer is ${["A", "B", "C", "D"][serverResult.correctIndex]}.`;
            await voiceRef.current.speak(fbText);
          }

          smRef.current.transition({ type: "FEEDBACK_DONE" });

          // Move to next question
          if (currentQuestionIndex < voiceQuestions.length - 1) {
            smRef.current.transition({ type: "NEXT_QUESTION" });
            setCurrentQuestionIndex((i) => i + 1);
            setTimeout(() => speakQuestion(currentQuestionIndex + 1), 1000);
          } else {
            smRef.current.transition({ type: "SESSION_COMPLETE" });
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to submit answer");
        }
      } else {
        // No match — ask again
        if (voiceRef.current) {
          await voiceRef.current.speak(
            "I didn't catch that. Please say A, B, C, or D, or the answer text.",
          );
          voiceRef.current.startListening({ timeout: 15000 });
        }
      }
    },
    [voiceQuestions, currentQuestionIndex, sessionId, submitAnswerMutation, speakQuestion],
  );

  // Set up voice recognition callbacks
  useEffect(() => {
    const voice = voiceRef.current;
    if (!voice) return;

    voice.onResult((transcript, isFinal) => {
      if (isFinal) {
        handleAnswer(transcript);
      } else {
        setLastTranscript(transcript);
      }
    });

    voice.onError((err) => {
      if (err === "timeout") {
        if (voiceRef.current && sessionState === "listening") {
          voiceRef.current.speak("I didn't hear anything. Say your answer or say 'skip'.");
          voiceRef.current.startListening({ timeout: 15000 });
        }
      }
    });
  }, [handleAnswer, sessionState]);

  const startSession = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await startSessionMutation.mutateAsync({
        mode: config.mode,
        examId: config.examId,
        sourceSessionId: config.sourceSessionId,
        sourceUserExamId: config.sourceUserExamId,
        subject: config.subject,
        topic: config.topic,
        questionCount: config.questionCount ?? 10,
        difficulty: config.difficulty ?? "mixed",
      });

      setSessionId(result.sessionId);
      setVoiceQuestions(result.questions);
      setScore({ correct: 0, total: result.questions.length, answered: 0 });
      setCurrentQuestionIndex(0);
      startTimeRef.current = Date.now();

      // Start the session
      if (voiceRef.current) {
        const introText =
          config.mode === "recap"
            ? `Let's review your exam. I'll go through each question. Say skip to move on, or explain for detailed explanation. Ready? Here's Question 1.`
            : config.mode === "teacher"
              ? `Hi! I'm your ExamForge tutor. Let's start studying. Here's your first question.`
              : `Starting a ${result.questions.length} question exam. I'll read each question and wait for your answer. Say the option letter or the answer text. Let's begin. Question 1.`;

        await voiceRef.current.speak(introText);
      }

      // Start first question
      smRef.current.reset();
      setTimeout(() => speakQuestion(0), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start voice session");
    } finally {
      setIsLoading(false);
    }
  }, [config, startSessionMutation, speakQuestion]);

  const skipQuestion = useCallback((): void => {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    smRef.current.transition({ type: "SKIP" });

    if (currentQuestionIndex < voiceQuestions.length - 1) {
      setCurrentQuestionIndex((i) => i + 1);
      setTimeout(() => speakQuestion(currentQuestionIndex + 1), 500);
    } else {
      smRef.current.transition({ type: "SESSION_COMPLETE" });
    }
  }, [currentQuestionIndex, voiceQuestions.length, speakQuestion]);

  const repeatQuestion = useCallback((): void => {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    speakQuestion(currentQuestionIndex);
  }, [currentQuestionIndex, speakQuestion]);

  const pauseSession = useCallback((): void => {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    smRef.current.transition({ type: "PAUSE" });
  }, []);

  const resumeSession = useCallback((): void => {
    smRef.current.transition({ type: "RESUME" });
    speakQuestion(currentQuestionIndex);
  }, [currentQuestionIndex, speakQuestion]);

  const stopSession = useCallback(async (): Promise<void> => {
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopListening();
    smRef.current.transition({ type: "STOP" });

    if (sessionId) {
      try {
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const result = await completeSessionMutation.mutateAsync({
          sessionId,
          durationSeconds,
        });
        config.onComplete?.(result);
      } catch {
        // Session completion failed, still close
      }
    }

    config.onClose?.();
  }, [sessionId, completeSessionMutation, config]);

  const submitTextAnswer = useCallback(
    (text: string): void => {
      handleAnswer(text);
    },
    [handleAnswer],
  );

  // Auto-complete when session reaches "complete" state
  useEffect(() => {
    if (sessionState === "complete" && sessionId) {
      const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      completeSessionMutation
        .mutateAsync({ sessionId, durationSeconds })
        .then((result) => config.onComplete?.(result))
        .catch(() => {});
    }
  }, [sessionState]); // intentionally only re-run on state change

  return {
    sessionState,
    currentQuestionIndex,
    questions: voiceQuestions,
    score,
    lastTranscript,
    lastResult,
    feedbackText,
    isLoading,
    sessionId,
    error,
    capabilities,
    startSession,
    skipQuestion,
    repeatQuestion,
    pauseSession,
    resumeSession,
    stopSession,
    submitTextAnswer,
  };
}
