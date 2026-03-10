"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  Pencil,
  Save,
  RotateCcw,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { QUESTION_TYPE_LABELS } from "@examforge/shared/constants";
import type { GeneratedQuestion, QuestionType } from "@examforge/shared";
import { QuestionEditDialog } from "./question-edit-dialog";

interface ResultsPreviewProps {
  questions: GeneratedQuestion[];
  onSave: (questions: GeneratedQuestion[]) => void;
  onReset: () => void;
  isSaving: boolean;
}

function QuestionContentDisplay({
  content,
}: {
  content: Record<string, unknown>;
}): React.ReactElement {
  const type = content.type as string;
  const questionText =
    (content.question as string) ?? (content.assertion as string) ?? "";

  return (
    <div className="space-y-2">
      <p className="text-sm">{questionText}</p>

      {type === "mcq" && (
        <div className="space-y-1">
          {(content.options as string[])?.map((opt, i) => (
            <div
              key={i}
              className={`text-xs rounded px-2 py-1 ${
                i === (content.answer as number)
                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 font-medium"
                  : "bg-muted"
              }`}
            >
              {String.fromCharCode(65 + i)}. {opt}
            </div>
          ))}
        </div>
      )}

      {type === "true_false" && (
        <Badge variant="secondary" className="text-xs">
          Answer: {(content.answer as boolean) ? "True" : "False"}
        </Badge>
      )}

      {type === "fill_blank" && (
        <Badge variant="secondary" className="text-xs">
          Answer: {content.answer as string}
        </Badge>
      )}

      {type === "match" && (
        <div className="space-y-1">
          {(content.pairs as Array<{ left: string; right: string }>)?.map(
            (pair, i) => (
              <div key={i} className="text-xs bg-muted rounded px-2 py-1">
                {pair.left} → {pair.right}
              </div>
            ),
          )}
        </div>
      )}

      {type === "assertion" && (
        <div className="space-y-1 text-xs">
          <div className="bg-muted rounded px-2 py-1">
            <strong>Reason:</strong> {content.reason as string}
          </div>
          <Badge variant="secondary">
            {(content.answer as string).replaceAll("_", " ")}
          </Badge>
        </div>
      )}

      {content.explanation && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            View explanation
          </summary>
          <p className="mt-1 text-muted-foreground">
            {content.explanation as string}
          </p>
        </details>
      )}
    </div>
  );
}

export function ResultsPreview({
  questions,
  onSave,
  onReset,
  isSaving,
}: ResultsPreviewProps): React.ReactElement {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(questions.map((_, i) => i)),
  );
  const [editedQuestions, setEditedQuestions] =
    useState<GeneratedQuestion[]>(questions);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const toggleSelection = useCallback((index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === editedQuestions.length) {
        return new Set();
      }
      return new Set(editedQuestions.map((_, i) => i));
    });
  }, [editedQuestions.length]);

  const handleRemove = useCallback(
    (index: number) => {
      setEditedQuestions((prev) => prev.filter((_, i) => i !== index));
      setSelectedIds((prev) => {
        const next = new Set<number>();
        for (const id of prev) {
          if (id < index) next.add(id);
          else if (id > index) next.add(id - 1);
        }
        return next;
      });
    },
    [],
  );

  const handleEditSave = useCallback(
    (index: number, updated: GeneratedQuestion) => {
      setEditedQuestions((prev) =>
        prev.map((q, i) => (i === index ? updated : q)),
      );
      setEditingIndex(null);
    },
    [],
  );

  const handleSaveSelected = useCallback(() => {
    const toSave = editedQuestions.filter((_, i) => selectedIds.has(i));
    if (toSave.length === 0) return;
    onSave(toSave);
  }, [editedQuestions, selectedIds, onSave]);

  const allSelected = selectedIds.size === editedQuestions.length;
  const selectedCount = selectedIds.size;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Generated Questions ({editedQuestions.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {allSelected ? (
                  <CheckSquare className="mr-1.5 h-4 w-4" />
                ) : (
                  <Square className="mr-1.5 h-4 w-4" />
                )}
                {allSelected ? "Deselect All" : "Select All"}
              </Button>
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Generate More
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editedQuestions.map((question, index) => {
            const content = question.content as Record<string, unknown>;
            const type = content.type as QuestionType;

            return (
              <div
                key={index}
                className={`rounded-lg border p-4 transition-colors ${
                  selectedIds.has(index)
                    ? "border-primary/30 bg-primary/5"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(index)}
                    onCheckedChange={() => toggleSelection(index)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {QUESTION_TYPE_LABELS[type]}
                      </Badge>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {question.difficulty}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {question.subject} / {question.topic}
                      </span>
                    </div>
                    <QuestionContentDisplay content={content} />
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setEditingIndex(index)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleRemove(index)}
                      title="Remove"
                    >
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {editedQuestions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              All questions have been removed.
              <Button variant="link" onClick={onReset} className="ml-1">
                Generate new questions
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Bar */}
      {editedQuestions.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
          <span className="text-sm text-muted-foreground">
            {selectedCount} of {editedQuestions.length} questions selected
          </span>
          <Button
            onClick={handleSaveSelected}
            disabled={selectedCount === 0 || isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving
              ? "Saving..."
              : `Save ${selectedCount} Question${selectedCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      {editingIndex !== null && (
        <QuestionEditDialog
          question={editedQuestions[editingIndex]}
          open={editingIndex !== null}
          onOpenChange={(open) => {
            if (!open) setEditingIndex(null);
          }}
          onSave={(updated) => handleEditSave(editingIndex, updated)}
        />
      )}
    </>
  );
}
