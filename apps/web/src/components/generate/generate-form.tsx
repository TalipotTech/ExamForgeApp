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
  Hash,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  XCircle,
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

  // Load exams from public.exams table (admin view)
  const { data: examList, isLoading: examsLoading } = trpc.exam.listForAdmin.useQuery();

  // Get exam details with portal document metadata
  const { data: examDetails } = trpc.exam.getWithPortalDetails.useQuery(
    { examId },
    { enabled: !!examId },
  );

  // Load syllabi for selected exam
  const { data: syllabiList, isLoading: syllabiLoading } = trpc.syllabus.list.useQuery(
    { examId },
    { enabled: !!examId },
  );

  // Load syllabus tree nodes when a syllabus is selected
  const { data: syllabusTree, isLoading: treeLoading } = trpc.syllabus.getTree.useQuery(
    { syllabusId: syllabusId! },
    { enabled: !!syllabusId },
  );

  const filters = trpc.question.filters.useQuery();

  const selectedExam = examList?.find((e) => e.id === examId);
  const processedSyllabi = syllabiList?.filter((s) => s.status === "parsed") ?? [];
  const allSyllabi = syllabiList ?? [];
  const topicNodes = syllabusTree?.nodes?.filter((n) => n.depth >= 2) ?? [];

  // Get first matched portal entry for the selected exam (for details box)
  const firstEntry = examDetails?.examEntries?.[0] as Record<string, unknown> | undefined;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    onGenerate({
      provider,
      examId: examId || undefined,
      examName: examName || undefined,
      subject: subject || undefined,
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

  const isValid = examId && (topic.trim() || topicNodeName);

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

          {/* ─── Exam Dropdown ─── */}
          <div className="space-y-2">
            <Label htmlFor="exam">Examination</Label>
            <Popover open={examOpen} onOpenChange={setExamOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={examOpen}
                  className={cn(
                    "w-full justify-between font-normal",
                    selectedExam?.hasSyllabus && "border-emerald-300 dark:border-emerald-700",
                  )}
                  disabled={examsLoading}
                >
                  {examsLoading ? (
                    <span className="text-muted-foreground">Loading exams...</span>
                  ) : selectedExam ? (
                    <span className="flex items-center gap-2 truncate">
                      {selectedExam.hasSyllabus ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="size-4 shrink-0 text-amber-400" />
                      )}
                      <span className="truncate">{selectedExam.name}</span>
                      {selectedExam.hasSyllabus && (
                        <Badge className="shrink-0 border-0 bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
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
                          className={cn(
                            "flex flex-col items-start gap-1 py-2.5",
                            exam.hasSyllabus
                              ? "border-l-2 border-l-emerald-400"
                              : "border-l-2 border-l-amber-300",
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                examId === exam.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="flex-1 truncate text-sm font-medium">{exam.name}</span>
                            {exam.hasSyllabus ? (
                              <Badge className="shrink-0 border-0 bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                <BookOpen className="mr-0.5 size-2.5" />
                                Syllabus
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-amber-300 px-1.5 py-0 text-[10px] text-amber-600 dark:border-amber-600 dark:text-amber-400"
                              >
                                No Syllabus
                              </Badge>
                            )}
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-1.5 pl-6">
                            {exam.category ? (
                              <Badge
                                variant="outline"
                                className="border-blue-200 bg-blue-50 px-1.5 py-0 text-[10px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                              >
                                {String(exam.category)}
                              </Badge>
                            ) : null}
                            {exam.questionCount != null && exam.questionCount > 0 && (
                              <Badge
                                variant="outline"
                                className="border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
                              >
                                {exam.questionCount} Qs
                              </Badge>
                            )}
                            {exam.conductingBody ? (
                              <span className="text-muted-foreground max-w-[150px] truncate text-[10px]">
                                {String(exam.conductingBody)}
                              </span>
                            ) : null}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* ─── Exam Details Box ─── */}
          {examId && examDetails && (
            <div
              className={cn(
                "space-y-3 rounded-lg border p-3",
                selectedExam?.hasSyllabus
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20"
                  : "border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20",
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Info className="size-3.5 text-blue-500" />
                  {examDetails.exam.name}
                </h4>
                <div className="flex items-center gap-2">
                  {selectedExam?.hasSyllabus ? (
                    <Badge className="border-0 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <CheckCircle2 className="mr-1 size-3" />
                      Syllabus Available
                    </Badge>
                  ) : (
                    <Badge className="border-0 bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <AlertCircle className="mr-1 size-3" />
                      No Syllabus
                    </Badge>
                  )}
                  <ExamFullDetailsDialog
                    exam={examDetails.exam}
                    portalDocs={examDetails.portalDocuments}
                    examEntries={examDetails.examEntries}
                    syllabusTree={syllabusTree}
                    hasSyllabus={selectedExam?.hasSyllabus ?? false}
                  />
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {examDetails.exam.category && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="size-3 text-blue-500" />
                    <span className="text-muted-foreground">Category:</span>
                    <Badge
                      variant="outline"
                      className="border-blue-200 bg-blue-50 px-1.5 py-0 text-[10px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/30"
                    >
                      {examDetails.exam.category}
                    </Badge>
                  </div>
                )}
                {examDetails.exam.conductingBody && (
                  <div className="flex items-center gap-1.5">
                    <Building className="size-3 text-indigo-500" />
                    <span className="text-muted-foreground">Body:</span>
                    <span className="truncate font-medium text-indigo-700 dark:text-indigo-300">
                      {examDetails.exam.conductingBody}
                    </span>
                  </div>
                )}
                {examDetails.exam.examDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3 text-orange-500" />
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium text-orange-700 dark:text-orange-300">
                      {new Date(examDetails.exam.examDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {examDetails.exam.officialUrl && (
                  <div className="flex items-center gap-1.5">
                    <ExternalLink className="size-3 text-cyan-500" />
                    <a
                      href={examDetails.exam.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-cyan-600 hover:underline dark:text-cyan-400"
                    >
                      Official URL
                    </a>
                  </div>
                )}
              </div>

              {/* Portal Examination Entry Info */}
              {firstEntry && (
                <div className="rounded-md border border-slate-200 bg-white/60 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Portal Examination Entry
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium">{firstEntry.examName as string}</span>
                    {firstEntry.categoryNumber ? (
                      <Badge className="border-0 bg-purple-100 px-1.5 py-0 text-[10px] text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        <Hash className="mr-0.5 size-2.5" />
                        Cat. {String(firstEntry.categoryNumber)}
                      </Badge>
                    ) : null}
                    {firstEntry.examDate ? (
                      <Badge className="border-0 bg-orange-100 px-1.5 py-0 text-[10px] text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                        <Calendar className="mr-0.5 size-2.5" />
                        {String(firstEntry.examDate)}
                      </Badge>
                    ) : null}
                    {firstEntry.department ? (
                      <Badge className="border-0 bg-teal-100 px-1.5 py-0 text-[10px] text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                        <Briefcase className="mr-0.5 size-2.5" />
                        {String(firstEntry.department)}
                      </Badge>
                    ) : null}
                  </div>
                  {examDetails.examEntries.length > 1 && (
                    <div className="text-muted-foreground mt-1 text-[10px]">
                      +{examDetails.examEntries.length - 1} more entries (see Full Details)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Syllabus Dropdown (always visible when exam selected) ─── */}
          {examId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="flex items-center gap-1.5">
                  <GraduationCap className="size-4 text-emerald-600" />
                  Syllabus
                </Label>
                {processedSyllabi.length > 0 ? (
                  <Badge className="border-0 bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40">
                    {processedSyllabi.length} available
                  </Badge>
                ) : (
                  <Badge className="border-0 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-600 dark:bg-amber-900/40">
                    {syllabiLoading
                      ? "Loading..."
                      : allSyllabi.length > 0
                        ? `${allSyllabi.length} (not processed)`
                        : "None available"}
                  </Badge>
                )}
                <span className="text-muted-foreground text-[10px]">(optional)</span>
              </div>
              {processedSyllabi.length > 0 ? (
                <Popover open={syllabusOpen} onOpenChange={setSyllabusOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between font-normal",
                        syllabusId && "border-emerald-300 dark:border-emerald-700",
                      )}
                    >
                      {syllabusName ? (
                        <span className="flex items-center gap-1.5 truncate">
                          <GraduationCap className="size-3.5 text-emerald-600" />
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
                              <GraduationCap className="size-3.5 text-emerald-600" />
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
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {syllabiLoading
                    ? "Loading syllabi..."
                    : allSyllabi.length > 0
                      ? `${allSyllabi.length} syllabus(es) found but none are processed yet.`
                      : "No syllabus uploaded for this exam. You can still generate questions using manual topic input."}
                </div>
              )}
            </div>
          )}

          {/* ─── Topic from Syllabus (always visible when syllabus selected) ─── */}
          {syllabusId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="flex items-center gap-1.5">
                  <ChevronRight className="size-4 text-violet-500" />
                  Topic from Syllabus
                </Label>
                {topicNodes.length > 0 && (
                  <Badge className="border-0 bg-violet-100 px-1.5 py-0 text-[10px] text-violet-700 dark:bg-violet-900/40">
                    {topicNodes.length} topics
                  </Badge>
                )}
                <span className="text-muted-foreground text-[10px]">(optional)</span>
              </div>
              {treeLoading ? (
                <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
                  Loading syllabus topics...
                </div>
              ) : topicNodes.length > 0 ? (
                <Popover open={topicOpen} onOpenChange={setTopicOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between font-normal",
                        topicNodeId && "border-violet-300 dark:border-violet-700",
                      )}
                    >
                      {topicNodeName ? (
                        <span className="flex items-center gap-1.5 truncate">
                          <ChevronRight className="size-3.5 text-violet-500" />
                          {topicNodeName}
                        </span>
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
                                setTopic(n.title);
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
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1 py-0 text-[9px]",
                                  n.nodeType === "topic"
                                    ? "border-violet-200 text-violet-600"
                                    : "opacity-40",
                                )}
                              >
                                {n.nodeType}
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
                  No topics found in this syllabus. Use manual topic input below.
                </div>
              )}
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
  hasSyllabus: boolean;
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
  hasSyllabus,
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
          <DialogTitle className="flex items-center gap-2">
            {exam.name as string}
            {hasSyllabus ? (
              <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 size-3" />
                Syllabus Available
              </Badge>
            ) : (
              <Badge className="border-0 bg-amber-100 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <AlertCircle className="mr-1 size-3" />
                No Syllabus
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Exam Info Grid */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50/50 p-3 dark:bg-slate-900/30">
            {exam.category ? (
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-blue-500" />
                <div>
                  <div className="text-muted-foreground text-[10px]">Category</div>
                  <Badge
                    variant="outline"
                    className="border-blue-200 bg-blue-50 text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/30"
                  >
                    {String(exam.category)}
                  </Badge>
                </div>
              </div>
            ) : null}
            {exam.conductingBody ? (
              <div className="flex items-center gap-2">
                <Building className="size-4 text-indigo-500" />
                <div>
                  <div className="text-muted-foreground text-[10px]">Conducting Body</div>
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    {String(exam.conductingBody)}
                  </span>
                </div>
              </div>
            ) : null}
            {exam.examDate ? (
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-orange-500" />
                <div>
                  <div className="text-muted-foreground text-[10px]">Exam Date</div>
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                    {new Date(String(exam.examDate)).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : null}
            {exam.status ? (
              <div className="flex items-center gap-2">
                <Info className="size-4 text-slate-500" />
                <div>
                  <div className="text-muted-foreground text-[10px]">Status</div>
                  <Badge variant="outline" className="text-[11px]">
                    {String(exam.status)}
                  </Badge>
                </div>
              </div>
            ) : null}
            {exam.discoverySource ? (
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-teal-500" />
                <div>
                  <div className="text-muted-foreground text-[10px]">Source</div>
                  <span className="text-xs font-medium">{String(exam.discoverySource)}</span>
                </div>
              </div>
            ) : null}
            {exam.officialUrl ? (
              <div className="flex items-center gap-2">
                <ExternalLink className="size-4 text-cyan-500" />
                <div>
                  <div className="text-muted-foreground text-[10px]">Official URL</div>
                  <a
                    href={String(exam.officialUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
                  >
                    Visit portal
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {/* Examination Entries from Portal */}
          {examEntries.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold">
                <Calendar className="size-4 text-orange-500" />
                Examination Entries ({examEntries.length})
              </h4>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {examEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60"
                  >
                    <div className="mb-1.5 text-sm font-medium">{entry.examName as string}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {entry.categoryNumber ? (
                        <Badge className="border-0 bg-purple-100 px-1.5 py-0 text-[10px] text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                          <Hash className="mr-0.5 size-2.5" />
                          Cat. {String(entry.categoryNumber)}
                        </Badge>
                      ) : null}
                      {entry.examDate ? (
                        <Badge className="border-0 bg-orange-100 px-1.5 py-0 text-[10px] text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                          <Calendar className="mr-0.5 size-2.5" />
                          {String(entry.examDate)}
                        </Badge>
                      ) : null}
                      {entry.department ? (
                        <Badge className="border-0 bg-teal-100 px-1.5 py-0 text-[10px] text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                          <Briefcase className="mr-0.5 size-2.5" />
                          {String(entry.department)}
                        </Badge>
                      ) : null}
                      {entry.venue ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {String(entry.venue)}
                        </Badge>
                      ) : null}
                      {entry.syllabusUrl ? (
                        <Badge className="border-0 bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40">
                          <BookOpen className="mr-0.5 size-2.5" />
                          Has Syllabus Link
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portal Documents */}
          {portalDocs.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold">
                <FileText className="size-4 text-blue-500" />
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
                        className={cn(
                          "px-1 py-0 text-[9px]",
                          doc.processingStatus === "processed" &&
                            "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                          doc.processingStatus === "error" &&
                            "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                        )}
                      >
                        {doc.processingStatus as string}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Syllabus Tree */}
          {syllabusTree && syllabusTree.nodes.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold">
                <GraduationCap className="size-4 text-emerald-500" />
                Syllabus: {syllabusTree.syllabus.name}
              </h4>
              <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-lg border bg-slate-50/50 p-2 text-xs dark:bg-slate-900/30">
                {syllabusTree.nodes.map((n) => (
                  <div key={n.id} className="py-0.5" style={{ paddingLeft: `${n.depth * 16}px` }}>
                    <span
                      className={cn(
                        n.depth === 0 && "text-sm font-bold",
                        n.depth === 1 && "font-semibold text-blue-700 dark:text-blue-300",
                        n.depth === 2 && "font-medium text-indigo-600 dark:text-indigo-400",
                        n.depth >= 3 && "text-muted-foreground",
                      )}
                    >
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
