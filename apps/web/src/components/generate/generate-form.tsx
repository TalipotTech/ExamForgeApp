"use client";

import { useState } from "react";
import { Sparkles, Cpu, Zap, Brain, Flame, BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_TYPE_LABELS } from "@examforge/shared/constants";
import { ExamCombobox } from "@/components/exam/exam-combobox";
import type { GenerateQuestionsInput } from "@examforge/shared";

type Provider = "anthropic" | "mistral" | "openai" | "google";
type Difficulty = "easy" | "medium" | "hard";
type QuestionType = keyof typeof QUESTION_TYPE_LABELS;

const PROVIDERS: {
  id: Provider;
  name: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
}[] = [
  {
    id: "anthropic",
    name: "Claude",
    description: "Quality-focused",
    icon: Cpu,
    iconColor: "text-orange-500",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Fast & cost-effective",
    icon: Zap,
    iconColor: "text-blue-500",
  },
  {
    id: "openai",
    name: "GPT-4o",
    description: "Structured output",
    icon: Brain,
    iconColor: "text-green-500",
  },
  {
    id: "google",
    name: "Gemini Flash",
    description: "Fast & cheap",
    icon: Flame,
    iconColor: "text-purple-500",
  },
];

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
  const [topicOpen, setTopicOpen] = useState(false);

  const { data: examList, isLoading: examsLoading } = trpc.exam.listForUser.useQuery();

  const filters = trpc.question.filters.useQuery();

  // Fetch syllabus topics when an exam is selected
  const { data: syllabusTopics } = trpc.syllabus.getTopicsForExam.useQuery(
    { examId },
    { enabled: !!examId },
  );

  const hasSyllabusTopics = syllabusTopics && syllabusTopics.length > 0;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    let syllabusContext: string | undefined;
    let existingQuestionTexts: string[] | undefined;

    // These will be fetched inline before generation
    // The caller (QuestionGenerator) handles this via the input fields
    onGenerate({
      provider,
      examId,
      subject,
      topic,
      count,
      difficulty,
      questionType,
      customPrompt: customPrompt.trim() || undefined,
      syllabusContext,
      existingQuestionTexts,
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
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProvider(p.id);
                      onProviderChange?.(p.id);
                    }}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      provider === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${p.iconColor}`} />
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-muted-foreground text-xs">{p.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exam & Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exam">Exam</Label>
              <ExamCombobox
                exams={examList ?? []}
                value={examId}
                onValueChange={(id) => {
                  setExamId(id);
                  setTopic("");
                }}
                isLoading={examsLoading}
                placeholder="Select exam"
              />
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

          {/* Topic — with autocomplete from syllabus if available */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="topic">Topic</Label>
              {hasSyllabusTopics && (
                <Badge
                  variant="secondary"
                  className="bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  <BookOpen className="mr-0.5 size-2.5" />
                  Syllabus topics available
                </Badge>
              )}
            </div>
            {hasSyllabusTopics ? (
              <Popover open={topicOpen} onOpenChange={setTopicOpen}>
                <PopoverTrigger asChild>
                  <Input
                    id="topic"
                    placeholder="Type or select from syllabus topics..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onFocus={() => setTopicOpen(true)}
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command>
                    <CommandInput
                      placeholder="Search topics..."
                      value={topic}
                      onValueChange={setTopic}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <span className="text-muted-foreground text-xs">
                          No matching syllabus topics. Your text will be used as-is.
                        </span>
                      </CommandEmpty>
                      <CommandGroup heading="Syllabus Topics">
                        {syllabusTopics
                          .filter((t) => t.title.toLowerCase().includes(topic.toLowerCase()))
                          .slice(0, 15)
                          .map((t) => (
                            <CommandItem
                              key={t.nodeId}
                              value={t.title}
                              onSelect={(val) => {
                                setTopic(val);
                                setTopicOpen(false);
                              }}
                              className="flex items-center gap-2"
                            >
                              <span className="flex-1 text-sm">{t.title}</span>
                              {t.parentTitle && (
                                <span className="text-muted-foreground max-w-[120px] truncate text-[10px]">
                                  {t.parentTitle}
                                </span>
                              )}
                              {t.hasTutorial && (
                                <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                                  Tutorial
                                </Badge>
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Input
                id="topic"
                placeholder="e.g., Pharmacokinetics, Drug Absorption"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            )}
          </div>

          {/* Count & Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="count">
                Number of Questions{" "}
                <span className="text-muted-foreground font-normal">(1-50)</span>
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
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
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
            <Select value={questionType} onValueChange={(v) => setQuestionType(v as QuestionType)}>
              <SelectTrigger id="questionType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-2">
            <Label htmlFor="customPrompt">
              Custom Prompt <span className="text-muted-foreground font-normal">(optional)</span>
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
          <Button type="submit" className="w-full" size="lg" disabled={isLoading || !isValid}>
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
