"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, SkipForward, RotateCcw, Square } from "lucide-react";
import type { VoiceSessionState } from "@/lib/voice/session-state-machine";

interface VoiceControlsProps {
  state: VoiceSessionState;
  score: { correct: number; total: number; answered: number };
  currentQuestion: number;
  totalQuestions: number;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onRepeat: () => void;
  onStop: () => void;
}

export function VoiceControls({
  state,
  score,
  currentQuestion,
  totalQuestions,
  onPause,
  onResume,
  onSkip,
  onRepeat,
  onStop,
}: VoiceControlsProps): React.ReactElement {
  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (state === "paused") onResume();
          else if (state !== "complete" && state !== "idle") onPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          onSkip();
          break;
        case "r":
        case "R":
          e.preventDefault();
          onRepeat();
          break;
        case "Escape":
          e.preventDefault();
          onStop();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, [state, onPause, onResume, onSkip, onRepeat, onStop]);

  const isPaused = state === "paused";
  const isComplete = state === "complete";
  const isActive = !isComplete && state !== "idle";
  const scorePercent = score.answered > 0 ? Math.round((score.correct / score.answered) * 100) : 0;

  return (
    <div className="bg-card border-t p-4">
      {/* Progress */}
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Score: {score.correct}/{score.answered} ({scorePercent}%)
        </span>
        <span className="text-muted-foreground">
          Q {currentQuestion + 1}/{totalQuestions}
        </span>
      </div>

      {/* Progress bar */}
      <div className="bg-muted mb-4 h-1.5 w-full rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{
            width: `${((currentQuestion + 1) / totalQuestions) * 100}%`,
          }}
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={isPaused ? onResume : onPause}
          disabled={isComplete || !isActive}
          title={isPaused ? "Resume (Space)" : "Pause (Space)"}
        >
          {isPaused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
          {isPaused ? "Resume" : "Pause"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          disabled={isComplete || isPaused}
          title="Skip (Right Arrow)"
        >
          <SkipForward className="mr-1 h-4 w-4" />
          Skip
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onRepeat}
          disabled={isComplete || isPaused}
          title="Repeat (R)"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          Repeat
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={onStop}
          disabled={isComplete}
          title="Stop (Esc)"
        >
          <Square className="mr-1 h-4 w-4" />
          Stop
        </Button>
      </div>

      {/* Keyboard shortcuts hint */}
      <p className="text-muted-foreground mt-2 text-center text-xs">
        Space: Pause/Resume | Right Arrow: Skip | R: Repeat | Esc: Stop
      </p>
    </div>
  );
}
