"use client";

import type { ExamQuestion } from "@/stores/exam-store";
import { AnimatePresence, motion } from "motion/react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

type QuestionDisplayProps = {
  question: ExamQuestion;
  index: number;
  total: number;
  selectedAnswer: number | undefined;
  isFlagged: boolean;
  onSelectAnswer: (optionIndex: number) => void;
  onClearAnswer: () => void;
  onToggleFlag: () => void;
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export function QuestionDisplay({
  question,
  index,
  total,
  selectedAnswer,
  isFlagged,
  onSelectAnswer,
  onClearAnswer,
  onToggleFlag,
}: QuestionDisplayProps): React.ReactElement {
  const content = question.content;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col gap-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm font-medium">
                Question {index + 1} of {total}
              </span>
              <Badge variant="outline" className="text-xs capitalize">
                {question.type.replace("_", " ")}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {question.subject}
              </Badge>
            </div>
          </div>
          <Button
            variant={isFlagged ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={onToggleFlag}
            aria-label={isFlagged ? "Remove flag" : "Flag question"}
          >
            <Flag className={cn("size-4", isFlagged ? "fill-orange-500 text-orange-500" : "")} />
          </Button>
        </div>

        {/* Question text */}
        {question.type === "assertion" ? (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium leading-relaxed sm:text-lg">
              <span className="font-semibold">Assertion (A):</span> {content.assertion as string}
            </p>
            <p className="text-base font-medium leading-relaxed sm:text-lg">
              <span className="font-semibold">Reason (R):</span> {content.reason as string}
            </p>
          </div>
        ) : (
          <p className="text-base font-medium leading-relaxed sm:text-lg">
            {content.question as string}
          </p>
        )}

        {/* Options */}
        {question.type === "mcq" && Array.isArray(content.options) && (
          <McqOptions
            options={content.options as string[]}
            selected={selectedAnswer}
            onSelect={onSelectAnswer}
          />
        )}

        {question.type === "true_false" && (
          <TrueFalseOptions selected={selectedAnswer} onSelect={onSelectAnswer} />
        )}

        {question.type === "assertion" && (
          <AssertionOptions selected={selectedAnswer} onSelect={onSelectAnswer} />
        )}

        {question.type === "match" && (
          <MatchDisplay pairs={content.pairs as Array<{ left: string; right: string }>} />
        )}

        {/* Clear answer */}
        {selectedAnswer !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAnswer}
            className="text-muted-foreground self-start"
          >
            <Eraser className="size-4" />
            Clear answer
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function McqOptions({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: number | undefined;
  onSelect: (i: number) => void;
}): React.ReactElement {
  return (
    <RadioGroup
      value={selected !== undefined ? String(selected) : undefined}
      onValueChange={(v) => onSelect(Number(v))}
      className="flex flex-col gap-3"
    >
      {options.map((option, i) => (
        <label
          key={i}
          className={cn(
            "hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
            selected === i && "border-primary bg-primary/5",
          )}
        >
          <RadioGroupItem value={String(i)} id={`option-${i}`} />
          <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
            {OPTION_LABELS[i]}
          </span>
          <Label htmlFor={`option-${i}`} className="cursor-pointer text-sm">
            {option}
          </Label>
        </label>
      ))}
    </RadioGroup>
  );
}

function TrueFalseOptions({
  selected,
  onSelect,
}: {
  selected: number | undefined;
  onSelect: (i: number) => void;
}): React.ReactElement {
  return (
    <div className="flex gap-4">
      {["True", "False"].map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(i)}
          className={cn(
            "hover:bg-accent flex-1 rounded-lg border p-4 text-center font-medium transition-colors",
            selected === i && "border-primary bg-primary/5",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const ASSERTION_OPTIONS = [
  "Both A and R are true, and R is the correct explanation of A",
  "Both A and R are true, but R is NOT the correct explanation of A",
  "A is true but R is false",
  "Both A and R are false",
];

function AssertionOptions({
  selected,
  onSelect,
}: {
  selected: number | undefined;
  onSelect: (i: number) => void;
}): React.ReactElement {
  return (
    <RadioGroup
      value={selected !== undefined ? String(selected) : undefined}
      onValueChange={(v) => onSelect(Number(v))}
      className="flex flex-col gap-3"
    >
      {ASSERTION_OPTIONS.map((option, i) => (
        <label
          key={i}
          className={cn(
            "hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
            selected === i && "border-primary bg-primary/5",
          )}
        >
          <RadioGroupItem value={String(i)} id={`assertion-${i}`} />
          <Label htmlFor={`assertion-${i}`} className="cursor-pointer text-sm">
            {option}
          </Label>
        </label>
      ))}
    </RadioGroup>
  );
}

function MatchDisplay({
  pairs,
}: {
  pairs: Array<{ left: string; right: string }>;
}): React.ReactElement {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground mb-3 text-sm font-medium">Match the following:</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="font-medium">Column A</div>
        <div className="font-medium">Column B</div>
        {pairs.map((pair, i) => (
          <div key={i} className="contents">
            <div className="bg-muted rounded p-2 text-sm">
              {i + 1}. {pair.left}
            </div>
            <div className="bg-muted rounded p-2 text-sm">
              {String.fromCharCode(65 + i)}. {pair.right}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
