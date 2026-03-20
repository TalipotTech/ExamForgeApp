"use client";

import { useState } from "react";
import {
  Sparkles,
  Cpu,
  Zap,
  Brain,
  Flame,
  Globe,
  BookOpen,
  Check,
  ChevronsUpDown,
  Info,
  Calendar,
  Building,
  ExternalLink,
  ChevronRight,
  FileText,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_TYPE_LABELS } from "@examforge/shared/constants";
import type { GenerateQuestionsInput } from "@examforge/shared";

type Provider = "anthropic" | "mistral" | "openai" | "google" | "perplexity";
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
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Web-backed, current",
    icon: Globe,
    iconColor: "text-teal-500",
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
  const [examName, setExamName] = useState("");
  const [syllabusId, setSyllabusId] = useState<number | null>(null);
  const [syllabusName, setSyllabusName] = useState("");
  const [topicNodeId, setTopicNodeId] = useState<number | null>(null);
  const [topicNodeName, setTopicNodeName] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [customPrompt, setCustomPrompt] = useState("");
  const [examOpen, setExamOpen] = useState(false);
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);

  // Load exams from public.exams table (admin view — all exams)
  const { data: examList, isLoading: examsLoading } = trpc.exam.listForAdmin.useQuery();

  // Get exam details with portal document metadata when an exam is selected
  const { data: examDetails } = trpc.exam.getWithPortalDetails.useQuery(
    { examId },
    { enabled: !!examId },
  );

  // Load syllabi for selected exam
  const { data: syllabiList } = trpc.syllabus.list.useQuery({ examId }, { enabled: !!examId });

  // Load syllabus tree nodes when a syllabus is selected
  const { data: syllabusTree } = trpc.syllabus.getTree.useQuery(
    { syllabusId: syllabusId! },
    { enabled: !!syllabusId },
  );

  const filters = trpc.question.filters.useQuery();

  const selectedExam = examList?.find((e) => e.id === examId);
  const processedSyllabi = syllabiList?.filter((s) => s.status === "processed") ?? [];
  const topicNodes = syllabusTree?.nodes?.filter((n) => n.depth >= 2) ?? [];

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    onGenerate({
      provider,
      examId: examId || undefined,
      examName: examName || undefined,
      subject,
      topic: topicNodeName || topic,
      count,
      difficulty,
      questionType,
      customPrompt: customPrompt.trim() || undefined,
      syllabusId: syllabusId ?? undefined,
      syllabusName: syllabusName || undefined,
      syllabusNodeId: topicNodeId ?? undefined,
      topicName: topicNodeName || undefined,
    });
  };

  const isValid = examId && subject && (topic.trim() || topicNodeName);

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
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
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

          {/* Exam Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="exam">Examination</Label>
            <Popover open={examOpen} onOpenChange={setExamOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={examOpen}
                  className="w-full justify-between font-normal"
                  disabled={examsLoading}
                >
                  {examsLoading ? (
                    <span className="text-muted-foreground">Loading exams...</span>
                  ) : selectedExam ? (
                    <span className="flex items-center gap-2 truncate">
                      <span className="truncate">{selectedExam.name}</span>
                      {selectedExam.hasSyllabus && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-green-100 px-1.5 py-0 text-[10px] text-green-700"
                        >
                          Syllabus
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select examination...</span>
                  )}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search exams..." />
                  <CommandList>
                    <CommandEmpty>No exams found.</CommandEmpty>
                    <CommandGroup>
                      {(examList ?? []).map((exam) => (
                        <CommandItem
                          key={exam.id}
                          value={`${exam.name} ${exam.category ?? ""} ${exam.conductingBody ?? ""}`}
                          onSelect={() => {
                            setExamId(exam.id);
                            setExamName(exam.name);
                            setSyllabusId(null);
                            setSyllabusName("");
                            setTopicNodeId(null);
                            setTopicNodeName("");
                            setTopic("");
                            setExamOpen(false);
                          }}
                          className="flex flex-col items-start gap-1 py-2.5"
                        >
                          <div className="flex w-full items-center gap-2">
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                examId === exam.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="flex-1 truncate text-sm font-medium">{exam.name}</span>
                            {exam.hasSyllabus && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 bg-green-100 px-1.5 py-0 text-[10px] text-green-700"
                              >
                                <BookOpen className="mr-0.5 size-2.5" />
                                Syllabus
                              </Badge>
                            )}
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-1.5 pl-6">
                            {exam.category && (
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                {exam.category}
                              </Badge>
                            )}
                            {exam.questionCount != null && exam.questionCount > 0 && (
                              <span className="text-muted-foreground text-[10px]">
                                {exam.questionCount} Qs
                              </span>
                            )}
                            {exam.conductingBody && (
                              <span className="text-muted-foreground max-w-[150px] truncate text-[10px]">
                                {exam.conductingBody}
                              </span>
                            )}
                            {exam.discoverySource && (
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 text-[10px] opacity-60"
                              >
                                {exam.discoverySource}
                              </Badge>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Exam Details Box */}
          {examId && examDetails && (
            <div className="bg-muted/30 space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-medium">
                  <Info className="size-3.5 text-blue-500" />
                  Exam Details
                </h4>
                <ExamFullDetailsDialog
                  exam={examDetails.exam}
                  portalDocs={examDetails.portalDocuments}
                  examEntries={examDetails.examEntries}
                  syllabusTree={syllabusTree}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {examDetails.exam.category && (
                  <div className="flex items-center gap-1">
                    <FileText className="text-muted-foreground size-3" />
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium">{examDetails.exam.category}</span>
                  </div>
                )}
                {examDetails.exam.conductingBody && (
                  <div className="flex items-center gap-1">
                    <Building className="text-muted-foreground size-3" />
                    <span className="text-muted-foreground">Body:</span>
                    <span className="truncate font-medium">{examDetails.exam.conductingBody}</span>
                  </div>
                )}
                {examDetails.exam.examDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="text-muted-foreground size-3" />
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">
                      {new Date(examDetails.exam.examDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {examDetails.exam.officialUrl && (
                  <div className="flex items-center gap-1">
                    <ExternalLink className="text-muted-foreground size-3" />
                    <a
                      href={examDetails.exam.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-blue-600 hover:underline"
                    >
                      Official URL
                    </a>
                  </div>
                )}
              </div>
              {examDetails.examEntries.length > 0 && (
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">Portal entries:</span>{" "}
                  <span className="font-medium">{examDetails.examEntries.length} matched</span>
                  {examDetails.examEntries[0]?.examDate && (
                    <span className="text-muted-foreground ml-2">
                      (Exam: {examDetails.examEntries[0].examDate})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Syllabus Dropdown (optional) */}
          {examId && processedSyllabi.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Syllabus</Label>
                <Badge
                  variant="secondary"
                  className="bg-green-100 px-1.5 py-0 text-[10px] text-green-700"
                >
                  {processedSyllabi.length} available
                </Badge>
                <span className="text-muted-foreground text-[10px]">(optional)</span>
              </div>
              <Popover open={syllabusOpen} onOpenChange={setSyllabusOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {syllabusName ? (
                      <span className="flex items-center gap-1.5 truncate">
                        <GraduationCap className="size-3.5 text-green-600" />
                        {syllabusName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select syllabus (optional)...</span>
                    )}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search syllabi..." />
                    <CommandList>
                      <CommandEmpty>No syllabi found.</CommandEmpty>
                      <CommandGroup>
                        {/* Option to clear selection */}
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setSyllabusId(null);
                            setSyllabusName("");
                            setTopicNodeId(null);
                            setTopicNodeName("");
                            setSyllabusOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          <Check
                            className={cn(
                              "size-4 shrink-0",
                              !syllabusId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="ml-2 text-sm italic">None (skip syllabus)</span>
                        </CommandItem>
                        {processedSyllabi.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            onSelect={() => {
                              setSyllabusId(s.id);
                              setSyllabusName(s.name);
                              setTopicNodeId(null);
                              setTopicNodeName("");
                              setSyllabusOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                syllabusId === s.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <GraduationCap className="size-3.5 text-green-600" />
                            <span className="flex-1 truncate text-sm">{s.name}</span>
                            {s.pageCount && (
                              <span className="text-muted-foreground text-[10px]">
                                {s.pageCount}p
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Topic from Syllabus (optional) */}
          {syllabusId && topicNodes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Topic from Syllabus</Label>
                <span className="text-muted-foreground text-[10px]">(optional)</span>
              </div>
              <Popover open={topicOpen} onOpenChange={setTopicOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {topicNodeName ? (
                      <span className="truncate">{topicNodeName}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Select topic from syllabus (optional)...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search topics..." />
                    <CommandList>
                      <CommandEmpty>No topics found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__topic"
                          onSelect={() => {
                            setTopicNodeId(null);
                            setTopicNodeName("");
                            setTopicOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          <Check
                            className={cn(
                              "size-4 shrink-0",
                              !topicNodeId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="ml-2 text-sm italic">None (type topic manually)</span>
                        </CommandItem>
                        {topicNodes.map((n) => (
                          <CommandItem
                            key={n.id}
                            value={n.title}
                            onSelect={() => {
                              setTopicNodeId(n.id);
                              setTopicNodeName(n.title);
                              setTopic(n.title); // also fill the text input
                              setTopicOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                topicNodeId === n.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span
                              className="flex-1 text-sm"
                              style={{ paddingLeft: `${(n.depth - 2) * 12}px` }}
                            >
                              {n.depth > 2 && (
                                <ChevronRight className="text-muted-foreground mr-0.5 inline size-3" />
                              )}
                              {n.title}
                            </span>
                            <Badge variant="outline" className="px-1 py-0 text-[9px] opacity-50">
                              {n.nodeType}
                            </Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Subject & Topic (manual) */}
          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="topic">
                Topic{" "}
                {topicNodeName && (
                  <span className="text-muted-foreground text-[10px] font-normal">
                    (from syllabus: {topicNodeName})
                  </span>
                )}
              </Label>
              <Input
                id="topic"
                placeholder={topicNodeName || "e.g., Pharmacokinetics, Drug Absorption"}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
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

// ─── Full Details Dialog ───

interface ExamFullDetailsDialogProps {
  exam: Record<string, unknown>;
  portalDocs: Array<Record<string, unknown>>;
  examEntries: Array<Record<string, unknown>>;
  syllabusTree?: {
    syllabus: { id: number; name: string; status: string | null; pageCount: number | null };
    nodes: Array<{
      id: number;
      parentId: number | null;
      nodeType: string;
      title: string;
      description: string | null;
      depth: number;
      sortOrder: number;
    }>;
  } | null;
}

function ExamFullDetailsDialog({
  exam,
  portalDocs,
  examEntries,
  syllabusTree,
}: ExamFullDetailsDialogProps): React.ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
          <ExternalLink className="mr-1 size-3" />
          Full Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exam.name as string}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Exam Info */}
          <div className="grid grid-cols-2 gap-3">
            {exam.category && (
              <div>
                <span className="text-muted-foreground">Category:</span>{" "}
                <span className="font-medium">{exam.category as string}</span>
              </div>
            )}
            {exam.conductingBody && (
              <div>
                <span className="text-muted-foreground">Conducting Body:</span>{" "}
                <span className="font-medium">{exam.conductingBody as string}</span>
              </div>
            )}
            {exam.status && (
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge variant="outline">{exam.status as string}</Badge>
              </div>
            )}
            {exam.discoverySource && (
              <div>
                <span className="text-muted-foreground">Source:</span>{" "}
                <span className="font-medium">{exam.discoverySource as string}</span>
              </div>
            )}
          </div>

          {/* Portal Documents */}
          {portalDocs.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-medium">
                <FileText className="size-4" />
                Portal Documents ({portalDocs.length})
              </h4>
              <div className="space-y-1.5">
                {portalDocs.map((doc) => (
                  <div key={doc.id as string} className="rounded border p-2 text-xs">
                    <div className="font-medium">{doc.title as string}</div>
                    <div className="text-muted-foreground mt-0.5 flex gap-3">
                      <span>{doc.documentType as string}</span>
                      <Badge
                        variant={doc.processingStatus === "processed" ? "default" : "secondary"}
                        className="px-1 py-0 text-[9px]"
                      >
                        {doc.processingStatus as string}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exam Entries */}
          {examEntries.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-medium">
                <Calendar className="size-4" />
                Examination Entries ({examEntries.length})
              </h4>
              <div className="max-h-60 space-y-1.5 overflow-y-auto">
                {examEntries.map((entry, i) => (
                  <div key={i} className="rounded border p-2 text-xs">
                    <div className="font-medium">{entry.examName as string}</div>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                      {entry.categoryNumber && <span>Cat. {entry.categoryNumber as string}</span>}
                      {entry.examDate && <span>{entry.examDate as string}</span>}
                      {entry.venue && <span>{entry.venue as string}</span>}
                      {entry.department && <span>{entry.department as string}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Syllabus Tree */}
          {syllabusTree && syllabusTree.nodes.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-medium">
                <GraduationCap className="size-4" />
                Syllabus: {syllabusTree.syllabus.name}
              </h4>
              <div className="max-h-60 space-y-0.5 overflow-y-auto text-xs">
                {syllabusTree.nodes.map((n) => (
                  <div key={n.id} className="py-0.5" style={{ paddingLeft: `${n.depth * 16}px` }}>
                    <span className={n.depth <= 1 ? "font-medium" : "text-muted-foreground"}>
                      {n.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
