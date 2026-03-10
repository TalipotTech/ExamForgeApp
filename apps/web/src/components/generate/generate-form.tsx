"use client";

import { useState } from "react";
import { Sparkles, Cpu, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_TYPE_LABELS } from "@examforge/shared/constants";
import type { GenerateQuestionsInput } from "@examforge/shared";

type Provider = "anthropic" | "mistral";
type Difficulty = "easy" | "medium" | "hard";
type QuestionType = keyof typeof QUESTION_TYPE_LABELS;

interface GenerateFormProps {
  onGenerate: (input: GenerateQuestionsInput) => void;
  isLoading: boolean;
  onProviderChange?: (provider: Provider) => void;
  onCountChange?: (count: number) => void;
}

export function GenerateForm({
  onGenerate,
  isLoading,
  onProviderChange,
  onCountChange,
}: GenerateFormProps): React.ReactElement {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [examId, setExamId] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [customPrompt, setCustomPrompt] = useState("");

  const filters = trpc.question.filters.useQuery();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({
      provider,
      examId,
      subject,
      topic,
      count,
      difficulty,
      questionType,
      customPrompt: customPrompt.trim() || undefined,
    });
  };

  const isValid = examId && subject && topic.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Generation Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* AI Provider */}
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setProvider("anthropic");
                  onProviderChange?.("anthropic");
                }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  provider === "anthropic"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Cpu className="h-5 w-5 shrink-0 text-orange-500" />
                <div>
                  <div className="text-sm font-medium">Claude</div>
                  <div className="text-xs text-muted-foreground">
                    Quality-focused
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvider("mistral");
                  onProviderChange?.("mistral");
                }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  provider === "mistral"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Zap className="h-5 w-5 shrink-0 text-blue-500" />
                <div>
                  <div className="text-sm font-medium">Mistral</div>
                  <div className="text-xs text-muted-foreground">
                    Fast &amp; cost-effective
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Exam & Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exam">Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger id="exam">
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  {filters.data?.exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="subject">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {filters.data?.subjects.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="e.g., Pharmacokinetics, Drug Absorption"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          {/* Count & Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="count">
                Number of Questions{" "}
                <span className="text-muted-foreground font-normal">
                  (1-50)
                </span>
              </Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => {
                  const val = Math.min(50, Math.max(1, parseInt(e.target.value) || 1));
                  setCount(val);
                  onCountChange?.(val);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as Difficulty)}
              >
                <SelectTrigger id="difficulty">
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

          {/* Question Type */}
          <div className="space-y-2">
            <Label htmlFor="questionType">Question Type</Label>
            <Select
              value={questionType}
              onValueChange={(v) => setQuestionType(v as QuestionType)}
            >
              <SelectTrigger id="questionType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(QUESTION_TYPE_LABELS) as [
                    QuestionType,
                    string,
                  ][]
                ).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-2">
            <Label htmlFor="customPrompt">
              Custom Prompt{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="customPrompt"
              placeholder="Add specific instructions for the AI, e.g., focus on clinical applications, include drug interactions..."
              rows={3}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isLoading || !isValid}
          >
            {isLoading ? (
              <>
                <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate {count} Questions
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
