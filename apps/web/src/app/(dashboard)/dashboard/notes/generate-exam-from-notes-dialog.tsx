"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { UpgradePlanBanner } from "@/components/upgrade-plan-banner";
import { useUpgradeLimitDialog } from "@/components/upgrade-limit-dialog";
import { AIProviderSelector, type ProviderId } from "@/components/ai-provider-selector";

interface GenerateExamFromNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNoteIds: number[];
  onSuccess: (examId: number) => void;
}

export function GenerateExamFromNotesDialog({
  open,
  onOpenChange,
  selectedNoteIds,
  onSuccess,
}: GenerateExamFromNotesDialogProps): React.ReactElement {
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [providers, setProviders] = useState<ProviderId[]>(["claude"]);
  const { showUpgradeDialog, UpgradeDialog } = useUpgradeLimitDialog();

  // Fetch current quota to show inline warning
  const quotaQuery = trpc.tutorialAgent.getExamQuota.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000,
  });
  const quota = quotaQuery.data;
  const isQuotaExhausted = quota ? quota.used >= quota.limit : false;

  const handleMutationError = (err: { message: string }): void => {
    const isQuotaError =
      err.message.includes("Exam generation limit reached") ||
      err.message.includes("Upgrade to generate");

    if (isQuotaError) {
      toast.error(err.message, {
        duration: 8000,
        className: "!bg-destructive !text-destructive-foreground !border-destructive",
      });
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
      console.error("[ExamForge] Exam generation error:", err.message);
      toast.error(`Exam generation failed: ${err.message}`, {
        duration: 10000,
        className: "!bg-destructive !text-destructive-foreground !border-destructive",
      });
    }
  };

  const generateMutation = trpc.tutorialAgent.generateExamFromNotes.useMutation({
    onSuccess: (data) => {
      toast.success(`Exam created with ${data.questionCount} questions!`);
      onOpenChange(false);
      onSuccess(data.examId);
    },
    onError: handleMutationError,
  });

  function handleGenerate(): void {
    if (selectedNoteIds.length === 0) return;
    if (providers.length === 0) {
      toast.error("Please select at least one AI provider.");
      return;
    }
    generateMutation.mutate({
      noteIds: selectedNoteIds,
      questionCount,
      difficulty,
      providers,
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" />
              Generate Exam from Notes
            </DialogTitle>
            <DialogDescription>
              Create a practice exam from {selectedNoteIds.length} selected note
              {selectedNoteIds.length > 1 ? "s" : ""}. The AI will generate MCQs based on your note
              content.
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

          <div className="space-y-5 py-2">
            {/* Question count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Number of Questions</Label>
                <span className="text-primary text-sm font-medium">{questionCount}</span>
              </div>
              <Slider
                value={[questionCount]}
                onValueChange={([v]) => setQuestionCount(v!)}
                min={5}
                max={50}
                step={5}
                className="w-full"
                disabled={isQuotaExhausted}
              />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>5</span>
                <span>50</span>
              </div>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as typeof difficulty)}
                disabled={isQuotaExhausted}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed (Recommended)</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* AI Model */}
            <div className="space-y-2">
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
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={generateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || isQuotaExhausted}
              className="gap-1.5"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Exam
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
