"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Play, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExamCombobox } from "@/components/exam/exam-combobox";
import { BrowseExamsDialog } from "@/components/exam/browse-exams-dialog";

/**
 * The five source tiers the student / admin can pick from, in the
 * order §1.2 of the strategy doc ranks trust: real papers first,
 * AI-only "practice" last. The values mirror questions.source_type.
 */
type SourceTier = "real_paper" | "textbook" | "topic_ai" | "pattern_ai" | "supplementary_ai";
const SOURCE_TIERS: { value: SourceTier; label: string; blurb: string; icon: string }[] = [
  {
    value: "real_paper",
    label: "Previous year questions",
    blurb: "Verified real-exam papers",
    icon: "🟢",
  },
  {
    value: "textbook",
    label: "Textbook MCQs",
    blurb: "Authored by standard texts",
    icon: "🔵",
  },
  {
    value: "topic_ai",
    label: "AI topic-seeded",
    blurb: "AI matched to real seeds",
    icon: "🟡",
  },
  {
    value: "pattern_ai",
    label: "AI pattern-matched",
    blurb: "AI matched to exam fingerprint",
    icon: "🟡",
  },
  {
    value: "supplementary_ai",
    label: "AI generated",
    blurb: "Syllabus-only AI practice",
    icon: "⚪",
  },
];

export default function ExamStartPage(): React.ReactElement {
  const router = useRouter();
  const { data: examList, isLoading: examsLoading } = trpc.exam.listForUser.useQuery();

  const startMutation = trpc.examSession.start.useMutation({
    onSuccess: (data) => {
      router.push(`/take/${data.sessionId}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [examId, setExamId] = useState("");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [browseOpen, setBrowseOpen] = useState(false);
  // Tier filter — matches the 6-tier trust ladder in
  // docs/features/QUESTION_ACQUISITION_STRATEGY.md §1.2. Empty = any
  // source (preserves old behaviour).
  const [sourceTypes, setSourceTypes] = useState<SourceTier[]>([]);
  function toggleSourceTier(tier: SourceTier): void {
    setSourceTypes((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier],
    );
  }

  // Pattern Exam — only shows when a selected exam has an analyzed pattern
  const { data: pattern } = trpc.examPattern.getPattern.useQuery(
    { examId },
    { enabled: Boolean(examId), staleTime: 5 * 60_000 },
  );

  // Pattern-exam generation is now queued — the mutation returns a
  // jobId instantly and we poll the status endpoint below until the
  // worker finishes (AI call typically 30-90s, previously blocked
  // past the Next.js dev proxy's socket timeout).
  const [patternJobId, setPatternJobId] = useState<string | null>(null);
  const patternExamMutation = trpc.examPattern.generatePatternExam.useMutation({
    onSuccess: (data) => {
      setPatternJobId(data.jobId);
      toast.success("Pattern exam queued — watch this card for progress.");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const patternJobStatusQuery = trpc.examPattern.getGeneratePatternExamStatus.useQuery(
    { jobId: patternJobId ?? "" },
    {
      enabled: Boolean(patternJobId),
      refetchInterval: patternJobId ? 3_000 : false,
    },
  );

  // On job completion (state=completed and a userExamId in the
  // return value), clear the polling and navigate to the practice
  // page. On failure, toast the error and clear state so the admin
  // can retry.
  useEffect(() => {
    const status = patternJobStatusQuery.data;
    if (!patternJobId || !status) return;
    if (status.state === "completed" && status.result?.userExamId) {
      toast.success(`Generated ${status.result.questionCount}-question pattern exam`);
      const target = status.result.userExamId;
      setPatternJobId(null);
      router.push(`/practice/${target}` as "/");
    } else if (status.state === "failed") {
      toast.error(status.failedReason ?? "Pattern exam generation failed");
      setPatternJobId(null);
    }
  }, [patternJobId, patternJobStatusQuery.data, router]);

  function handleStartPatternExam(): void {
    if (!examId) {
      toast.error("Please select an exam first");
      return;
    }
    patternExamMutation.mutate({
      examId,
      questionCount: 100,
      includeRepeats: true,
      includeCurrentAffairs: true,
    });
  }

  function handleStart(e: React.FormEvent): void {
    e.preventDefault();
    if (!examId) {
      toast.error("Please select an exam");
      return;
    }
    startMutation.mutate({
      examId,
      totalQuestions,
      durationMinutes: durationMinutes || undefined,
      sourceTypes: sourceTypes.length > 0 ? sourceTypes : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Start an Exam</h1>
        <p className="text-muted-foreground">Configure and begin a practice exam session.</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Exam Configuration</CardTitle>
          <CardDescription>Select your exam and set the number of questions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStart} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="exam">Exam</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setBrowseOpen(true)}
                >
                  <Search className="mr-1 size-3" />
                  Browse more exams
                </Button>
              </div>
              <ExamCombobox
                exams={examList ?? []}
                value={examId}
                onValueChange={setExamId}
                isLoading={examsLoading}
                placeholder="Search and select an exam..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="totalQuestions">Number of Questions</Label>
              <Input
                id="totalQuestions"
                type="number"
                min={1}
                max={200}
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Number(e.target.value))}
              />
              <p className="text-muted-foreground text-xs">Between 1 and 200 questions</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">
                Time Limit (minutes) <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="duration"
                type="number"
                min={1}
                max={360}
                placeholder="Auto: 1.5 min per question"
                value={durationMinutes ?? ""}
                onChange={(e) =>
                  setDurationMinutes(e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </div>

            {/* Source tier picker — optional. Top-down = highest-trust
                first; AI-only supplementary is deliberately the last
                option so a student can opt into "real papers only"
                by picking the top tiers and leaving the bottom off. */}
            <div className="flex flex-col gap-2">
              <Label>
                Question sources <span className="text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-muted-foreground text-xs">
                Leave all unchecked for any source. Tick one or more to restrict this session to
                only those tiers.
              </p>
              <div className="flex flex-col gap-1.5 pt-1">
                {SOURCE_TIERS.map((tier) => {
                  const active = sourceTypes.includes(tier.value);
                  return (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => toggleSourceTier(tier.value)}
                      className={`flex items-center gap-2 rounded-md border p-2 text-left text-xs transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span aria-hidden className="text-sm">
                        {tier.icon}
                      </span>
                      <span className="flex-1">
                        <span className="font-medium">{tier.label}</span>
                        <span className="text-muted-foreground ml-1">— {tier.blurb}</span>
                      </span>
                      <input
                        type="checkbox"
                        readOnly
                        checked={active}
                        className="pointer-events-none size-3.5"
                        tabIndex={-1}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <Button type="submit" disabled={startMutation.isPending || !examId} className="w-full">
              <Play className="size-4" />
              {startMutation.isPending ? "Starting..." : "Start Exam"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Pattern Exam — appears when the selected exam has an analyzed pattern */}
      {pattern && (
        <>
          <Separator className="max-w-lg" />
          <Card className="border-primary/40 max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="text-primary size-4" />
                Pattern Exam
                <Badge variant="outline" className="ml-auto text-green-600">
                  Based on {pattern.papersAnalyzed} papers
                </Badge>
              </CardTitle>
              <CardDescription>
                100 questions matching the real exam&apos;s subject weightage, difficulty mix, and
                question styles — generated from pattern analysis of past papers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="secondary"
                onClick={handleStartPatternExam}
                disabled={patternExamMutation.isPending || Boolean(patternJobId)}
                className="w-full"
              >
                <Sparkles className="size-4" />
                {(() => {
                  if (patternExamMutation.isPending) return "Queuing pattern exam...";
                  if (patternJobId) {
                    const state = patternJobStatusQuery.data?.state;
                    if (state === "active") return "Generating pattern exam (30-90s)...";
                    return "Queued — waiting for worker...";
                  }
                  return "Generate & Start Pattern Exam";
                })()}
              </Button>
              {patternJobId && (
                <p className="text-muted-foreground mt-2 text-xs">
                  The AI call takes 30-90 seconds. This card will redirect you to the practice page
                  as soon as the 100 questions are ready.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <BrowseExamsDialog open={browseOpen} onOpenChange={setBrowseOpen} />
    </div>
  );
}
