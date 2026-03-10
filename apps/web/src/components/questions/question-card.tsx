"use client";

import { useState } from "react";
import { ChevronDown, Trash2, Pencil, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type QuestionItem = {
  id: string;
  examId: string;
  examName: string;
  type: string;
  content: Record<string, unknown>;
  subject: string;
  topic: string | null;
  difficulty: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  true_false: "True / False",
  fill_blank: "Fill in the Blank",
  match: "Match",
  assertion: "Assertion–Reason",
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

function getQuestionText(content: Record<string, unknown>): string {
  if (typeof content.question === "string") return content.question;
  if (typeof content.assertion === "string") return content.assertion;
  return "—";
}

function McqContent({ content }: { content: Record<string, unknown> }): React.ReactElement {
  const options = content.options as string[] | undefined;
  const answer = content.answer as number | undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{content.question as string}</p>
      <div className="space-y-1.5">
        {options?.map((opt, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
              i === answer
                ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-muted/50",
            )}
          >
            <span className="mt-px shrink-0 font-mono text-xs font-semibold">
              {OPTION_LABELS[i]}.
            </span>
            <span>{opt}</span>
            {i === answer && <Check className="ml-auto mt-0.5 size-4 shrink-0 text-emerald-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrueFalseContent({ content }: { content: Record<string, unknown> }): React.ReactElement {
  const answer = content.answer as boolean;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{content.question as string}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Answer:</span>
        <Badge variant={answer ? "default" : "destructive"}>{answer ? "True" : "False"}</Badge>
      </div>
    </div>
  );
}

function FillBlankContent({ content }: { content: Record<string, unknown> }): React.ReactElement {
  const acceptableAnswers = content.acceptableAnswers as string[] | undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{content.question as string}</p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">Answer:</span>
          <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {content.answer as string}
          </span>
        </div>
        {acceptableAnswers && acceptableAnswers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Also accepted:</span>
            {acceptableAnswers.map((a, i) => (
              <Badge key={i} variant="outline">
                {a}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchContent({ content }: { content: Record<string, unknown> }): React.ReactElement {
  const pairs = content.pairs as Array<{ left: string; right: string }> | undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{content.question as string}</p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Left</th>
              <th className="px-3 py-2 text-left font-medium">Right</th>
            </tr>
          </thead>
          <tbody>
            {pairs?.map((pair, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-3 py-2">{pair.left}</td>
                <td className="px-3 py-2">{pair.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ASSERTION_ANSWER_LABELS: Record<string, string> = {
  both_true_reason_correct: "Both true, reason is correct explanation",
  both_true_reason_incorrect: "Both true, reason is NOT correct explanation",
  assertion_true_reason_false: "Assertion true, reason false",
  both_false: "Both assertion and reason are false",
};

function AssertionContent({ content }: { content: Record<string, unknown> }): React.ReactElement {
  const answer = content.answer as string;

  return (
    <div className="space-y-3">
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-semibold">Assertion: </span>
          <span className="leading-relaxed">{content.assertion as string}</span>
        </div>
        <div>
          <span className="font-semibold">Reason: </span>
          <span className="leading-relaxed">{content.reason as string}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Answer:</span>
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {ASSERTION_ANSWER_LABELS[answer] ?? answer}
        </span>
      </div>
    </div>
  );
}

function QuestionContentRenderer({
  type,
  content,
}: {
  type: string;
  content: Record<string, unknown>;
}): React.ReactElement {
  switch (type) {
    case "mcq":
      return <McqContent content={content} />;
    case "true_false":
      return <TrueFalseContent content={content} />;
    case "fill_blank":
      return <FillBlankContent content={content} />;
    case "match":
      return <MatchContent content={content} />;
    case "assertion":
      return <AssertionContent content={content} />;
    default:
      return <p className="text-sm text-muted-foreground">Unknown question type</p>;
  }
}

export function QuestionCard({
  question,
  onDelete,
  isDeleting,
}: {
  question: QuestionItem;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const questionText = getQuestionText(question.content);
  const explanation = question.content.explanation as string | undefined;

  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex-1 space-y-2">
              <p className="line-clamp-2 text-sm font-medium leading-snug">{questionText}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{TYPE_LABELS[question.type] ?? question.type}</Badge>
                <Badge variant="secondary" className={DIFFICULTY_COLORS[question.difficulty]}>
                  {question.difficulty}
                </Badge>
                <Badge variant="secondary">{question.subject}</Badge>
                {question.topic && <Badge variant="outline">{question.topic}</Badge>}
                {question.source && (
                  <Badge variant="outline" className="max-w-48 truncate">
                    {question.source}
                  </Badge>
                )}
                <Badge variant="outline" className="text-muted-foreground">
                  {question.examName}
                </Badge>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <CardContent className="space-y-4 pt-4 pb-4">
            <QuestionContentRenderer type={question.type} content={question.content} />

            {explanation && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Explanation
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{explanation}</p>
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Created{" "}
                {new Date(question.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>
                  <Pencil className="mr-1.5 size-3.5" />
                  Edit
                </Button>
                {!confirmDelete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(true);
                    }}
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Delete
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="mr-1 text-xs text-destructive">Sure?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isDeleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(question.id);
                      }}
                    >
                      <Check className="mr-1 size-3.5" />
                      Yes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(false);
                      }}
                    >
                      <X className="mr-1 size-3.5" />
                      No
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
