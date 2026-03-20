"use client";

import { useState, useCallback } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { questionOutputSchema } from "@/lib/ai-schemas";
import type { GenerateQuestionsInput, GeneratedQuestion } from "@examforge/shared";
import { GenerateForm } from "./generate-form";
import { ProviderInfoPanel } from "./provider-info-panel";
import { GenerationProgress } from "./generation-progress";
import { ResultsPreview } from "./results-preview";
import { CostSummary } from "./cost-summary";

type Phase = "form" | "generating" | "results";
type Provider = "anthropic" | "mistral" | "openai" | "google" | "perplexity";

interface UsageInfo {
  provider: Provider;
  startTime: number;
  endTime?: number;
}

export function QuestionGenerator(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>("form");
  const [formData, setFormData] = useState<GenerateQuestionsInput | null>(null);
  const [finalQuestions, setFinalQuestions] = useState<GeneratedQuestion[]>([]);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [previewProvider, setPreviewProvider] = useState<Provider>("anthropic");
  const [previewCount, setPreviewCount] = useState(10);

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/ai/generate",
    schema: questionOutputSchema,
    onFinish: ({ object: result }) => {
      if (result?.questions) {
        setFinalQuestions(result.questions as GeneratedQuestion[]);
        setUsageInfo((prev) => (prev ? { ...prev, endTime: Date.now() } : null));
        setPhase("results");
      }
    },
    onError: (err) => {
      const msg = err.message ?? String(err);
      if (msg.includes("quota") || msg.includes("429") || msg.includes("QUOTA_EXCEEDED")) {
        toast.error(
          "Provider quota exceeded. Please try a different AI provider or check your billing.",
          { duration: 8000 },
        );
      } else if (msg.includes("401") || msg.includes("AUTH_ERROR") || msg.includes("API key")) {
        toast.error(
          "Provider authentication failed. Check the API key configuration for this provider.",
          { duration: 8000 },
        );
      } else {
        toast.error(`Generation failed: ${msg.slice(0, 200)}`);
      }
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

  const utils = trpc.useUtils();

  const handleGenerate = useCallback(
    async (input: GenerateQuestionsInput) => {
      setFormData(input);
      setPhase("generating");
      setFinalQuestions([]);
      setUsageInfo({ provider: input.provider, startTime: Date.now() });

      // Fetch syllabus context and existing questions for dedup (only if examId is available)
      let enrichedInput: GenerateQuestionsInput = { ...input };

      if (input.examId) {
        const [syllabusContext, existingTexts] = await Promise.allSettled([
          utils.syllabus.getTopicContent.fetch({
            examId: input.examId,
            topicTitle: input.topic,
          }),
          utils.question.getExistingForTopic.fetch({
            examId: input.examId,
            topic: input.topic,
          }),
        ]);

        enrichedInput = {
          ...input,
          syllabusContext:
            syllabusContext.status === "fulfilled" && syllabusContext.value
              ? syllabusContext.value
              : undefined,
          existingQuestionTexts:
            existingTexts.status === "fulfilled" && existingTexts.value.length > 0
              ? existingTexts.value
              : undefined,
        };
      }

      submit(enrichedInput);
    },
    [submit, utils],
  );

  const handleStop = useCallback(() => {
    stop();
    if (object?.questions && object.questions.length > 0) {
      setFinalQuestions(object.questions as GeneratedQuestion[]);
      setUsageInfo((prev) => (prev ? { ...prev, endTime: Date.now() } : null));
      setPhase("results");
    } else {
      setPhase("form");
    }
  }, [stop, object]);

  const handleSave = useCallback(
    (questions: GeneratedQuestion[]) => {
      if (!formData || !formData.examId) {
        toast.error(
          "Cannot save: no exam mapped. Questions were generated but require an exam mapping to save.",
        );
        return;
      }
      bulkCreate.mutate({
        questions: questions.map((q) => ({
          examId: formData.examId!,
          content: q.content,
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
          source: "ai-generated",
          syllabusId: formData.syllabusId,
          syllabusName: formData.syllabusName,
          syllabusNodeId: formData.syllabusNodeId,
          topicName: formData.topicName,
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
        <h1 className="text-2xl font-bold tracking-tight">AI Question Generator</h1>
        <p className="text-muted-foreground mt-1">Generate exam questions using AI providers</p>
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
            <ProviderInfoPanel provider={previewProvider} count={previewCount} />
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
          settings={
            formData
              ? {
                  examName: formData.examName,
                  provider: formData.provider,
                  syllabusName: formData.syllabusName,
                  topicName: formData.topicName,
                  subject: formData.subject,
                  difficulty: formData.difficulty,
                  questionType: formData.questionType,
                }
              : undefined
          }
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
              durationMs={(usageInfo.endTime ?? Date.now()) - usageInfo.startTime}
            />
          )}
        </div>
      )}
    </div>
  );
}
