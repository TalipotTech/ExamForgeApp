"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, FlaskConical, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { trpc } from "@/lib/trpc";

const SOURCE_TYPES = [
  { value: "question_bank", label: "Question Bank" },
  { value: "previous_year", label: "Previous Year Papers" },
  { value: "mock_test", label: "Mock Tests" },
  { value: "syllabus", label: "Syllabus" },
  { value: "notes", label: "Notes" },
  { value: "portal", label: "Portal" },
] as const;

const FREQUENCIES = [
  { value: "manual", label: "Manual Only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const CONTENT_FORMATS = [
  { value: "html", label: "HTML Pages" },
  { value: "pdf", label: "PDF Downloads" },
  { value: "image", label: "Images (Scanned)" },
  { value: "mixed", label: "Mixed" },
] as const;

const AI_PROVIDERS = [
  { value: "auto", label: "Auto (Cheapest)" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "mistral", label: "Mistral" },
] as const;

type TestResult = {
  questionsFound: number;
  pageTitle: string;
  pageRelevance?: string;
  error?: string;
  preview: Array<{
    question: string;
    options?: string[];
    answer?: number;
    type?: string;
    subject?: string;
    difficulty?: string;
  }>;
  aiProvider?: string;
  aiModel?: string;
  tokensUsed?: number;
  estimatedCost?: number;
};

export default function AddSourcePage(): React.ReactElement {
  const router = useRouter();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [examId, setExamId] = useState<string>("");
  const [sourceType, setSourceType] = useState("question_bank");
  const [frequency, setFrequency] = useState("manual");
  const [depth, setDepth] = useState(1);
  const [format, setFormat] = useState("html");
  const [provider, setProvider] = useState("auto");
  const [notes, setNotes] = useState("");

  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const examsQuery = trpc.scrapeSource.exams.useQuery();

  const createMutation = trpc.scrapeSource.create.useMutation({
    onSuccess: () => {
      router.push("/scraper" as "/");
    },
  });

  const testMutation = trpc.scrapeSource.testScrape.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
    },
  });

  function handleSave(_asDraft: boolean): void {
    if (!name || !url) return;

    createMutation.mutate({
      name,
      url,
      examId: examId || undefined,
      sourceType: sourceType as
        | "question_bank"
        | "previous_year"
        | "mock_test"
        | "syllabus"
        | "notes"
        | "portal",
      scrapeFrequency: frequency as "manual" | "daily" | "weekly" | "monthly",
      scrapeDepth: depth,
      contentFormat: format as "html" | "pdf" | "image" | "mixed",
      aiProvider: provider,
      notes: notes || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href={"/scraper" as "/"}
          className="text-primary mb-2 flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to Scraper Manager
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add New Source</h1>
        <p className="text-muted-foreground text-sm">
          Configure a website to automatically scrape exam questions
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Form */}
        <Card>
          <CardContent className="space-y-5 pt-6">
            {/* Name + Exam */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., PharmQuiz Daily MCQs"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Exam</Label>
                <Select value={examId} onValueChange={setExamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-detect" />
                  </SelectTrigger>
                  <SelectContent>
                    {examsQuery.data?.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id}>
                        {exam.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label>Website URL *</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://pharmaquiz.net/bpharm-mcqs"
                type="url"
              />
            </div>

            {/* Source Type + Frequency + Depth */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Source Type</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scrape Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scrape Depth (pages)</Label>
                <Input
                  type="number"
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  min={1}
                  max={10}
                />
              </div>
            </div>

            {/* Format + Provider */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Content Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>AI Provider for Extraction</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes / Special Instructions</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., 'Questions are behind /mcq/ path. Skip advertisement sections.'"
                rows={3}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  if (url) {
                    testMutation.mutate({ url });
                  }
                }}
                disabled={!url || testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FlaskConical className="size-4" />
                )}
                Test Scrape
              </Button>
              <Button
                className="gap-2"
                onClick={() => handleSave(false)}
                disabled={!name || !url || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save &amp; Activate
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSave(true)}
                disabled={!name || !url || createMutation.isPending}
              >
                Save as Draft
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* How It Works */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                "Enter the URL of a question bank or exam prep site",
                "Click 'Test Scrape' to preview what the AI can extract",
                "Configure frequency for automatic scraping",
                "AI extracts, validates, and deduplicates questions",
                "Questions appear in your Question Bank automatically",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Test Results */}
          {testMutation.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center py-8">
                <Loader2 className="text-primary mb-2 size-8 animate-spin" />
                <p className="text-sm font-medium text-yellow-600">Scraping &amp; Extracting...</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Fetching page → AI extraction → Validating
                </p>
              </CardContent>
            </Card>
          )}

          {testResult && !testMutation.isPending && (
            <Card
              className={
                testResult.error
                  ? "border-red-200 dark:border-red-900"
                  : "border-green-200 dark:border-green-900"
              }
            >
              <CardContent className="space-y-3 pt-4">
                {testResult.error ? (
                  <div className="text-sm text-red-600">{testResult.error}</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                      <CheckCircle2 className="size-4" />
                      Test Successful — {testResult.pageTitle}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Found{" "}
                      <span className="text-foreground font-semibold">
                        {testResult.questionsFound} questions
                      </span>{" "}
                      {testResult.pageRelevance && (
                        <span>(relevance: {testResult.pageRelevance})</span>
                      )}
                    </p>
                    {testResult.aiProvider && (
                      <p className="text-muted-foreground text-xs">
                        AI: {testResult.aiProvider}/{testResult.aiModel} | Tokens:{" "}
                        {testResult.tokensUsed} | Cost: ${testResult.estimatedCost?.toFixed(4)}
                      </p>
                    )}
                    <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Preview ({testResult.preview.length} of {testResult.questionsFound})
                    </div>
                    {testResult.preview.map((q, i) => (
                      <div key={i} className="bg-muted/30 rounded-lg border p-3 text-sm">
                        <div className="mb-1 flex gap-2">
                          {q.type && (
                            <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-medium">
                              {q.type}
                            </span>
                          )}
                          {q.subject && (
                            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                              {q.subject}
                            </span>
                          )}
                          {q.difficulty && (
                            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                              {q.difficulty}
                            </span>
                          )}
                        </div>
                        <p className="mb-2 font-medium">{q.question}</p>
                        {q.options && (
                          <div className="grid grid-cols-2 gap-1">
                            {q.options.map((opt, j) => (
                              <p
                                key={j}
                                className={`text-xs ${j === q.answer ? "font-semibold text-green-600" : "text-muted-foreground"}`}
                              >
                                {String.fromCharCode(65 + j)}) {opt} {j === q.answer && "✓"}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
