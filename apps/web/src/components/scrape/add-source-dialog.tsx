"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

type SourceData = {
  id: string;
  name: string;
  url: string;
  examId: string | null;
  config: Record<string, unknown>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSource?: SourceData | null;
  onSuccess: () => void;
};

const QUESTION_TYPES = [
  { value: "mcq", label: "MCQ" },
  { value: "true_false", label: "True / False" },
  { value: "fill_blank", label: "Fill in the Blank" },
  { value: "match", label: "Match" },
  { value: "assertion", label: "Assertion-Reason" },
] as const;

export function AddSourceDialog({
  open,
  onOpenChange,
  editSource,
  onSuccess,
}: Props): React.ReactElement {
  const isEdit = !!editSource;

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [examId, setExamId] = useState("");
  const [crawlerType, setCrawlerType] = useState<"cheerio" | "playwright">("cheerio");
  const [maxPages, setMaxPages] = useState("50");
  const [fetchDelay, setFetchDelay] = useState("2000");
  const [contentSelector, setContentSelector] = useState("");
  const [urlPatterns, setUrlPatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "mcq",
    "true_false",
    "fill_blank",
    "match",
    "assertion",
  ]);

  const examsQuery = trpc.scrape.exams.useQuery();

  const createMutation = trpc.scrape.create.useMutation({ onSuccess });
  const updateMutation = trpc.scrape.update.useMutation({ onSuccess });

  useEffect(() => {
    if (editSource) {
      setName(editSource.name);
      setUrl(editSource.url);
      setExamId(editSource.examId ?? "");
      const cfg = editSource.config as Record<string, unknown>;
      setCrawlerType((cfg.crawlerType as "cheerio" | "playwright") ?? "cheerio");
      setMaxPages(String(cfg.maxPages ?? 50));
      setFetchDelay(String(cfg.fetchDelayMs ?? 2000));
      setContentSelector((cfg.contentSelector as string) ?? "");
      setUrlPatterns(
        Array.isArray(cfg.urlPatterns) ? (cfg.urlPatterns as string[]).join("\n") : "",
      );
      setExcludePatterns(
        Array.isArray(cfg.excludePatterns) ? (cfg.excludePatterns as string[]).join("\n") : "",
      );
      setSelectedTypes(
        Array.isArray(cfg.questionTypes)
          ? (cfg.questionTypes as string[])
          : ["mcq", "true_false", "fill_blank", "match", "assertion"],
      );
    } else {
      setName("");
      setUrl("");
      setExamId("");
      setCrawlerType("cheerio");
      setMaxPages("50");
      setFetchDelay("2000");
      setContentSelector("");
      setUrlPatterns("");
      setExcludePatterns("");
      setSelectedTypes(["mcq", "true_false", "fill_blank", "match", "assertion"]);
    }
  }, [editSource, open]);

  function handleTypeToggle(type: string): void {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function buildConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
      crawlerType,
      maxPages: Number(maxPages) || 50,
      fetchDelayMs: Number(fetchDelay) || 2000,
      questionTypes: selectedTypes,
    };
    if (contentSelector.trim()) config.contentSelector = contentSelector.trim();
    if (urlPatterns.trim()) {
      config.urlPatterns = urlPatterns
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
    }
    if (excludePatterns.trim()) {
      config.excludePatterns = excludePatterns
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
    }
    return config;
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const config = buildConfig();

    if (isEdit && editSource) {
      updateMutation.mutate({
        id: editSource.id,
        name,
        url,
        examId: examId || undefined,
        config,
      });
    } else {
      if (!examId) return;
      createMutation.mutate({ name, url, examId, config });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isValid = name.trim() && url.trim() && (isEdit || examId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Source" : "Add Scrape Source"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the configuration for this scrape source."
              : "Add a website to scrape exam questions from."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="source-name">Name</Label>
            <Input
              id="source-name"
              placeholder="e.g. PharmQuiz Daily MCQs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="source-url">Website URL</Label>
            <Input
              id="source-url"
              type="url"
              placeholder="https://example.com/exam-questions"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          {/* Exam */}
          <div className="space-y-2">
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an exam" />
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

          {/* Crawler Type */}
          <div className="space-y-2">
            <Label>Crawler Type</Label>
            <Select
              value={crawlerType}
              onValueChange={(v) => setCrawlerType(v as "cheerio" | "playwright")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cheerio">Cheerio (Fast, static HTML)</SelectItem>
                <SelectItem value="playwright">Playwright (JS-rendered sites)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Max Pages & Delay */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-pages">Max Pages</Label>
              <Input
                id="max-pages"
                type="number"
                min={1}
                max={500}
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fetch-delay">Delay (ms)</Label>
              <Input
                id="fetch-delay"
                type="number"
                min={500}
                max={30000}
                step={500}
                value={fetchDelay}
                onChange={(e) => setFetchDelay(e.target.value)}
              />
            </div>
          </div>

          {/* Content Selector */}
          <div className="space-y-2">
            <Label htmlFor="content-selector">
              Content Selector <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="content-selector"
              placeholder="e.g. article.main-content, #questions"
              value={contentSelector}
              onChange={(e) => setContentSelector(e.target.value)}
            />
          </div>

          {/* Question Types */}
          <div className="space-y-2">
            <Label>Question Types</Label>
            <div className="flex flex-wrap gap-3">
              {QUESTION_TYPES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedTypes.includes(value)}
                    onCheckedChange={() => handleTypeToggle(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* URL Patterns */}
          <div className="space-y-2">
            <Label htmlFor="url-patterns">
              URL Patterns{" "}
              <span className="text-muted-foreground">(one regex per line, optional)</span>
            </Label>
            <textarea
              id="url-patterns"
              className="border-input shadow-xs placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1"
              placeholder=".*\/mcq\/.*&#10;.*\/quiz\/.*"
              value={urlPatterns}
              onChange={(e) => setUrlPatterns(e.target.value)}
              rows={2}
            />
          </div>

          {/* Exclude Patterns */}
          <div className="space-y-2">
            <Label htmlFor="exclude-patterns">
              Exclude Patterns{" "}
              <span className="text-muted-foreground">(one regex per line, optional)</span>
            </Label>
            <textarea
              id="exclude-patterns"
              className="border-input shadow-xs placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1"
              placeholder=".*\/login.*&#10;.*\/admin.*"
              value={excludePatterns}
              onChange={(e) => setExcludePatterns(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
