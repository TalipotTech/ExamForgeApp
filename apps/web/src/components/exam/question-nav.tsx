"use client";

import type { ExamQuestion } from "@/stores/exam-store";
import { cn } from "@/lib/utils";

type QuestionNavProps = {
  questions: ExamQuestion[];
  currentIndex: number;
  answers: Record<string, number>;
  flagged: Set<string>;
  onNavigate: (index: number) => void;
  compact?: boolean;
};

export function QuestionNav({
  questions,
  currentIndex,
  answers,
  flagged,
  onNavigate,
  compact = false,
}: QuestionNavProps): React.ReactElement {
  if (compact) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {questions.map((q, i) => (
          <NavCircle
            key={q.id}
            index={i}
            isCurrent={i === currentIndex}
            isAnswered={answers[q.id] !== undefined}
            isFlagged={flagged.has(q.id)}
            onClick={() => onNavigate(i)}
            size="sm"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Questions
      </h2>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, i) => (
          <NavCircle
            key={q.id}
            index={i}
            isCurrent={i === currentIndex}
            isAnswered={answers[q.id] !== undefined}
            isFlagged={flagged.has(q.id)}
            onClick={() => onNavigate(i)}
            size="md"
          />
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-green-500" />
          Answered
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-muted" />
          Unanswered
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-orange-500" />
          Flagged
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full ring-2 ring-primary" />
          Current
        </div>
      </div>
    </div>
  );
}

type NavCircleProps = {
  index: number;
  isCurrent: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  onClick: () => void;
  size: "sm" | "md";
};

function NavCircle({
  index,
  isCurrent,
  isAnswered,
  isFlagged,
  onClick,
  size,
}: NavCircleProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-full font-medium transition-all",
        size === "sm" ? "size-7 text-xs" : "size-9 text-sm",
        isFlagged
          ? "bg-orange-500 text-white"
          : isAnswered
            ? "bg-green-500 text-white"
            : "bg-muted text-muted-foreground",
        isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      aria-label={`Question ${index + 1}${isAnswered ? " (answered)" : ""}${isFlagged ? " (flagged)" : ""}`}
      aria-current={isCurrent ? "step" : undefined}
    >
      {index + 1}
    </button>
  );
}
