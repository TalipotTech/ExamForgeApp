"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { UpgradePlanBanner } from "@/components/upgrade-plan-banner";
import { useUpgradeLimitDialog } from "@/components/upgrade-limit-dialog";
import { AIProviderSelector, type ProviderId } from "@/components/ai-provider-selector";

interface GenerateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syllabusId: number;
  selectedNodeIds: number[];
  mode: "multi-topic" | "single-topic" | "batch";
  tutorialFileId?: number;
}

export function GenerateExamDialog({
  open,
  onOpenChange,
  syllabusId,
  selectedNodeIds,
  mode,
  tutorialFileId,
}: GenerateExamDialogProps): React.ReactElement {
  const router = useRouter();
  const [questionsPerTopic, setQuestionsPerTopic] = useState(5);
  const [difficulty, setDifficulty] = useState<string>("mixed");
  const [batchCount, setBatchCount] = useState(2);
  const [providers, setProviders] = useState<ProviderId[]>(["claude"]);
  const { showUpgradeDialog, UpgradeDialog } = useUpgradeLimitDialog();

  // Fetch current quota to show inline warning
  const quotaQuery = trpc.tutorialAgent.getExamQuota.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000,
  });
  const quota = quotaQuery.data;

  const handleMutationError = (err: { message: string }): void => {
    // Check if this is a quota/limit error (FORBIDDEN from backend)
    const isQuotaError =
      err.message.includes("Exam generation limit reached") ||
      err.message.includes("Upgrade to generate");

    if (isQuotaError) {
      // Show styled toast for quota errors
      toast.error(err.message, {
        duration: 8000,
        className: "!bg-destructive !text-destructive-foreground !border-destructive",
      });
      // Show the upgrade popup dialog
      if (quota) {
        showUpgradeDialog({ used: quota.used, limit: quota.limit, planName: quota.planName });
      } else {
        const match = err.message.match(/\((\d+)\/(\d+) on (.+?) plan\)/);
        if (match) {
          showUpgradeDialog({
            used: parseInt(match[1]!, 10),
            limit: parseInt(match[2]!, 10),
            planName: match[3]!,
          });
        }
      }
    } else {
      // Non-quota error — show error toast with longer duration
      console.error("[ExamForge] Exam generation error:", err.message);
      toast.error(`Exam generation failed: ${err.message}`, {
        duration: 10000,
        className: "!bg-destructive !text-destructive-foreground !border-destructive",
      });
    }
  };

  const multiTopicMutation = trpc.tutorialAgent.generateMultiTopicExam.useMutation({
    onSuccess: (data) => {
      toast.success(`Exam generated with ${data.questionCount} questions!`);
      onOpenChange(false);
      router.push(`/practice/${data.examId}` as "/");
    },
    onError: handleMutationError,
  });

  const batchMutation = trpc.tutorialAgent.generateBatchExams.useMutation({
    onSuccess: (data) => {
      toast.success(
        `${data.examIds.length} exams generated with ${data.totalQuestions} total questions!`,
      );
      onOpenChange(false);
      router.push("/dashboard/my-exams");
    },
    onError: handleMutationError,
  });

  const singleMutation = trpc.tutorialAgent.generateUserExam.useMutation({
    onSuccess: (data) => {
      toast.success(`Exam generated with ${data.questionCount} questions!`);
      onOpenChange(false);
      router.push(`/practice/${data.examId}` as "/");
    },
    onError: handleMutationError,
  });

  const isPending =
    multiTopicMutation.isPending || batchMutation.isPending || singleMutation.isPending;

  const isQuotaExhausted = quota ? quota.used >= quota.limit : false;

  const handleGenerate = (): void => {
    if (providers.length === 0) {
      toast.error("Please select at least one AI provider.");
      return;
    }
    const diff = difficulty as "mixed" | "easy" | "medium" | "hard";
    if (mode === "multi-topic") {
      multiTopicMutation.mutate({
        syllabusId,
        syllabusNodeIds: selectedNodeIds,
        questionsPerTopic,
        difficulty: diff,
        providers,
      });
    } else if (mode === "batch" && tutorialFileId) {
      batchMutation.mutate({
        tutorialFileId,
        count: batchCount,
        questionsPerExam: questionsPerTopic * 2,
        difficulty: diff,
        providers,
      });
    } else if (mode === "single-topic" && tutorialFileId && selectedNodeIds[0]) {
      singleMutation.mutate({
        syllabusNodeId: selectedNodeIds[0],
        tutorialFileId,
        questionCount: questionsPerTopic * 2,
        difficulty: diff,
        providers,
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-primary size-5" />
              Generate Practice Exam
            </DialogTitle>
            <DialogDescription>
              {mode === "multi-topic"
                ? `Generate an exam from ${selectedNodeIds.length} selected topic${selectedNodeIds.length > 1 ? "s" : ""}.`
                : mode === "batch"
                  ? "Generate multiple non-overlapping exams from this tutorial."
                  : "Generate a practice exam from this topic."}
            </DialogDescription>
          </DialogHeader>

          {/* Inline quota warning/exhausted banner */}
          {quota && (
            <UpgradePlanBanner
              used={quota.used}
              limit={quota.limit}
              planName={quota.planName}
              variant="inline"
            />
          )}

          <div className="flex flex-col gap-4 py-4">
            {mode === "batch" ? (
              <div className="flex flex-col gap-2">
                <Label>Number of exams</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  disabled={isQuotaExhausted}
                />
                <p className="text-muted-foreground text-xs">
                  Questions will not repeat across exams
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label>{mode === "multi-topic" ? "Questions per topic" : "Questions per exam"}</Label>
              <Input
                type="number"
                min={2}
                max={20}
                value={questionsPerTopic}
                onChange={(e) => setQuestionsPerTopic(Number(e.target.value))}
                disabled={isQuotaExhausted}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty} disabled={isQuotaExhausted}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed (30% easy, 50% medium, 20% hard)</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>AI Model</Label>
              <AIProviderSelector
                mode="multi"
                selected={providers}
                onSelect={setProviders}
                compact
              />
              {providers.length > 1 && (
                <p className="text-muted-foreground text-xs">
                  Multiple models selected — best result will be used
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isPending || isQuotaExhausted}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {UpgradeDialog}
    </>
  );
}
