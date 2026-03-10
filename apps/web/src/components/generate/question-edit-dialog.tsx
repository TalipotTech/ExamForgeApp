"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GeneratedQuestion } from "@examforge/shared";

interface QuestionEditDialogProps {
  question: GeneratedQuestion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: GeneratedQuestion) => void;
}

function McqEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}): React.ReactElement {
  const options = (content.options as string[]) ?? ["", "", "", ""];
  const answer = (content.answer as number) ?? 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Question</Label>
        <Textarea
          value={(content.question as string) ?? ""}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Options</Label>
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm font-medium w-6">
              {String.fromCharCode(65 + i)}.
            </span>
            <Input
              value={opt}
              onChange={(e) => {
                const newOptions = [...options];
                newOptions[i] = e.target.value;
                onChange({ ...content, options: newOptions });
              }}
            />
            <input
              type="radio"
              name="correctAnswer"
              checked={answer === i}
              onChange={() => onChange({ ...content, answer: i })}
              className="h-4 w-4"
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Select the radio button next to the correct answer
        </p>
      </div>
    </div>
  );
}

function TrueFalseEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Question</Label>
        <Textarea
          value={(content.question as string) ?? ""}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Answer</Label>
        <Select
          value={String(content.answer)}
          onValueChange={(v) =>
            onChange({ ...content, answer: v === "true" })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FillBlankEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Question (use ___ for blank)</Label>
        <Textarea
          value={(content.question as string) ?? ""}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Answer</Label>
        <Input
          value={(content.answer as string) ?? ""}
          onChange={(e) => onChange({ ...content, answer: e.target.value })}
        />
      </div>
    </div>
  );
}

function MatchEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}): React.ReactElement {
  const pairs = (content.pairs as Array<{ left: string; right: string }>) ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Question</Label>
        <Textarea
          value={(content.question as string) ?? ""}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Pairs</Label>
        {pairs.map((pair, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <Input
              value={pair.left}
              onChange={(e) => {
                const newPairs = [...pairs];
                newPairs[i] = { ...newPairs[i], left: e.target.value };
                onChange({ ...content, pairs: newPairs });
              }}
              placeholder="Left"
            />
            <Input
              value={pair.right}
              onChange={(e) => {
                const newPairs = [...pairs];
                newPairs[i] = { ...newPairs[i], right: e.target.value };
                onChange({ ...content, pairs: newPairs });
              }}
              placeholder="Right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AssertionEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Assertion</Label>
        <Textarea
          value={(content.assertion as string) ?? ""}
          onChange={(e) => onChange({ ...content, assertion: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Reason</Label>
        <Textarea
          value={(content.reason as string) ?? ""}
          onChange={(e) => onChange({ ...content, reason: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Answer</Label>
        <Select
          value={(content.answer as string) ?? "both_true_reason_correct"}
          onValueChange={(v) => onChange({ ...content, answer: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both_true_reason_correct">
              Both true, reason is correct
            </SelectItem>
            <SelectItem value="both_true_reason_incorrect">
              Both true, reason is incorrect
            </SelectItem>
            <SelectItem value="assertion_true_reason_false">
              Assertion true, reason false
            </SelectItem>
            <SelectItem value="both_false">Both false</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function QuestionEditDialog({
  question,
  open,
  onOpenChange,
  onSave,
}: QuestionEditDialogProps): React.ReactElement {
  const [editedContent, setEditedContent] = useState<Record<string, unknown>>(
    question.content as Record<string, unknown>,
  );
  const [explanation, setExplanation] = useState(
    (question.content as Record<string, unknown>).explanation as string ?? "",
  );
  const [editedDifficulty, setEditedDifficulty] = useState(question.difficulty);

  const type = (editedContent.type as string) ?? "mcq";

  const handleSave = () => {
    const updatedContent = { ...editedContent, explanation };
    onSave({
      ...question,
      content: updatedContent as GeneratedQuestion["content"],
      difficulty: editedDifficulty,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {type === "mcq" && (
            <McqEditor content={editedContent} onChange={setEditedContent} />
          )}
          {type === "true_false" && (
            <TrueFalseEditor
              content={editedContent}
              onChange={setEditedContent}
            />
          )}
          {type === "fill_blank" && (
            <FillBlankEditor
              content={editedContent}
              onChange={setEditedContent}
            />
          )}
          {type === "match" && (
            <MatchEditor content={editedContent} onChange={setEditedContent} />
          )}
          {type === "assertion" && (
            <AssertionEditor
              content={editedContent}
              onChange={setEditedContent}
            />
          )}

          {/* Explanation */}
          <div className="space-y-2">
            <Label>Explanation</Label>
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
            />
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <Select
              value={editedDifficulty}
              onValueChange={(v) =>
                setEditedDifficulty(v as "easy" | "medium" | "hard")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
