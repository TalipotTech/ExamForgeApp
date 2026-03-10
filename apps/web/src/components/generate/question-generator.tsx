"use client";

import { useState, useCallback } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { questionOutputSchema } from "@/lib/ai-schemas";
import type {
  GenerateQuestionsInput,
  GeneratedQuestion,
} from "@examforge/shared";
import { GenerateForm } from "./generate-form";
import { ProviderInfoPanel } from "./provider-info-panel";
import { GenerationProgress } from "./generation-progress";
import { ResultsPreview } from "./results-preview";
import { CostSummary } from "./cost-summary";

type Phase = "form" | "generating" | "results";

interface UsageInfo {
  provider: "anthropic" | "mistral";
  startTime: number;
  endTime?: number;
}

export function QuestionGenerator(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>("form");
  const [formData, setFormData] = useState<GenerateQuestionsInput | null>(null);
  const [finalQuestions, setFinalQuestions] = useState<GeneratedQuestion[]>([]);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [previewProvider, setPreviewProvider] = useState<"anthropic" | "mistral">("anthropic");
  const [previewCount, setPreviewCount] = useState(10);

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/ai/generate",
    schema: questionOutputSchema,
    onFinish: ({ object: result }) => {
      if (result?.questions) {
        setFinalQuestions(result.questions as GeneratedQuestion[]);
        setUsageInfo((prev) =>
          prev ? { ...prev, endTime: Date.now() } : null,
        );
        setPhase("results");
      }
    },
    onError: (err) => {
      toast.error(`Generation failed: ${err.message}`);
      setPhase("form");
    },
  });

  const bulkCreate = trpc.question.bulkCreate.useMutation({
    onSuccess: (data) => {
      toast.success(`Saved ${data.count} questions to the database`);
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  const handleGenerate = useCallback(
    (input: GenerateQuestionsInput) => {
      setFormData(input);
      setPhase("generating");
      setFinalQuestions([]);
      setUsageInfo({ provider: input.provider, startTime: Date.now() });
      submit(input);
    },
    [submit],
  );

  const handleStop = useCallback(() => {
    stop();
    if (object?.questions && object.questions.length > 0) {
      setFinalQuestions(object.questions as GeneratedQuestion[]);
      setUsageInfo((prev) =>
        prev ? { ...prev, endTime: Date.now() } : null,
      );
      setPhase("results");
    } else {
      setPhase("form");
    }
  }, [stop, object]);

  const handleSave = useCallback(
    (questions: GeneratedQuestion[]) => {
      if (!formData) return;
      bulkCreate.mutate({
        questions: questions.map((q) => ({
          examId: formData.examId,
          content: q.content,
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
          source: "ai-generated",
        })),
      });
    },
    [formData, bulkCreate],
  );

  const handleReset = useCallback(() => {
    setPhase("form");
    setFinalQuestions([]);
    setUsageInfo(null);
  }, []);

  const streamedQuestions = (object?.questions ?? []) as Partial<GeneratedQuestion>[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          AI Question Generator
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate exam questions using AI providers
        </p>
      </div>

      {phase === "form" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GenerateForm
              onGenerate={handleGenerate}
              isLoading={isLoading}
              onProviderChange={setPreviewProvider}
              onCountChange={setPreviewCount}
            />
          </div>
          <div>
            <ProviderInfoPanel
              provider={previewProvider}
              count={previewCount}
            />
          </div>
        </div>
      )}

      {phase === "generating" && (
        <GenerationProgress
          streamedQuestions={streamedQuestions}
          totalRequested={formData?.count ?? 0}
          isLoading={isLoading}
          error={error}
          onStop={handleStop}
        />
      )}

      {phase === "results" && (
        <div className="space-y-6">
          <ResultsPreview
            questions={finalQuestions}
            onSave={handleSave}
            onReset={handleReset}
            isSaving={bulkCreate.isPending}
          />
          {usageInfo && (
            <CostSummary
              provider={usageInfo.provider}
              questionCount={finalQuestions.length}
              durationMs={
                (usageInfo.endTime ?? Date.now()) - usageInfo.startTime
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
