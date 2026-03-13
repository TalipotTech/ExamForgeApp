"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  FileText,
  Globe,
  BookOpen,
  ClipboardList,
  Eye,
  Bookmark,
  Shield,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ─── Types ───

type SearchResult = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName?: string;
  sourceDomain?: string;
  contentType: string;
  snippet?: string;
  matchQuality: string;
  relevanceScore: number;
  sourceQuality: string;
  metadata: Record<string, unknown>;
};

// ─── Content Type Filters ───

const CONTENT_TYPES = [
  { value: "all", label: "All" },
  { value: "previous_questions", label: "Questions" },
  { value: "syllabus", label: "Syllabus" },
  { value: "mock_test", label: "Mock Tests" },
  { value: "study_material", label: "Study Material" },
  { value: "answer_key", label: "Answer Key" },
] as const;

const FORMAT_FILTERS = [
  { value: "all", label: "All" },
  { value: "pdf", label: "PDF" },
  { value: "web", label: "Web" },
] as const;

const YEAR_OPTIONS = [
  { value: "any", label: "Any Year" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "2023", label: "2023" },
  { value: "2022", label: "2022" },
] as const;

const PLACEHOLDERS = [
  "GPAT 2024 previous year questions with answers",
  "NEET UG 2025 syllabus PDF",
  "Pharmacology MCQs with explanations",
  "Kerala PSC Assistant Professor pharmacy questions",
  "UPSC prelims 2024 GS Paper 1",
];

// ─── Icon helpers ───

function ContentTypeIcon({ type }: { type: string }): React.ReactElement {
  switch (type) {
    case "pdf":
      return <FileText className="h-5 w-5 text-red-500" />;
    case "syllabus":
      return <BookOpen className="h-5 w-5 text-purple-500" />;
    case "question_set":
      return <ClipboardList className="h-5 w-5 text-green-500" />;
    default:
      return <Globe className="h-5 w-5 text-blue-500" />;
  }
}

function QualityBadge({ quality }: { quality: string }): React.ReactElement | null {
  switch (quality) {
    case "official":
      return (
        <Badge variant="outline" className="border-green-500 text-xs text-green-600">
          <Shield className="mr-1 h-3 w-3" />
          Official
        </Badge>
      );
    case "established":
      return (
        <Badge variant="outline" className="border-blue-500 text-xs text-blue-600">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Established
        </Badge>
      );
    case "community":
      return (
        <Badge variant="secondary" className="text-xs">
          Community
        </Badge>
      );
    default:
      return null;
  }
}

function MatchDot({ quality }: { quality: string }): React.ReactElement {
  const color =
    quality === "high" ? "bg-green-500" : quality === "medium" ? "bg-amber-500" : "bg-gray-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

// ─── Main Page ───

export default function FindContentPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <FindContentPageInner />
    </Suspense>
  );
}

function FindContentPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [contentType, setContentType] = useState("all");
  const [year, setYear] = useState("any");
  const [format, setFormat] = useState("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<SearchResult | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Rotate placeholder
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000);
    return (): void => clearInterval(interval);
  }, []);

  // Search mutation
  const searchMutation = trpc.contentFinder.search.useMutation({
    onSuccess: (data) => {
      setSearchId(data.searchId);
      setResults(data.results);
      if (data.fromCache) {
        toast.info("Results loaded from cache");
      }
    },
    onError: (err) => {
      toast.error(`Search failed: ${err.message}`);
    },
  });

  // Preview mutation
  const previewMutation = trpc.contentFinder.previewResult.useMutation({
    onSuccess: (data) => {
      setPreviewText(data.preview);
    },
    onError: () => {
      toast.error("Failed to load preview");
    },
  });

  // Save mutation
  const saveMutation = trpc.contentFinder.saveResult.useMutation({
    onSuccess: () => {
      toast.success("Content saved to your library");
    },
    onError: () => {
      toast.error("Failed to save content");
    },
  });

  // Search history
  const historyQuery = trpc.contentFinder.getSearchHistory.useQuery(
    { limit: 5 },
    { enabled: results.length === 0 },
  );

  // Auto-search on mount if query param present
  useEffect(() => {
    if (initialQuery && initialQuery.length >= 3) {
      searchMutation.mutate({
        query: initialQuery,
        contentType: "all",
        format: "all",
      });
    }
  }, [initialQuery]); // searchMutation is stable

  function handleSearch(overrideQuery?: string): void {
    const q = overrideQuery ?? query;
    if (q.length < 3) {
      toast.error("Query must be at least 3 characters");
      return;
    }
    searchMutation.mutate({
      query: q,
      contentType: contentType as "all",
      year: year !== "any" ? parseInt(year) : undefined,
      format: format as "all",
    });
  }

  function handlePreview(result: SearchResult): void {
    setPreviewResult(result);
    setPreviewText(null);
    previewMutation.mutate({ resultId: result.id });
  }

  function handleSave(resultId: string): void {
    saveMutation.mutate({ resultId, saveType: "bookmark" });
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Find Content</h1>
        <p className="text-muted-foreground text-sm">
          Search for previous questions, syllabus, study material, and more
        </p>
      </div>

      {/* ─── Search Bar ─── */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={PLACEHOLDERS[placeholderIdx]}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button
            onClick={() => handleSearch()}
            disabled={searchMutation.isPending || query.length < 3}
          >
            {searchMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Search
          </Button>
        </div>

        {/* ─── Filters ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {CONTENT_TYPES.map((ct) => (
              <Button
                key={ct.value}
                variant={contentType === ct.value ? "default" : "outline"}
                size="sm"
                onClick={() => setContentType(ct.value)}
              >
                {ct.label}
              </Button>
            ))}
          </div>

          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1">
            {FORMAT_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={format === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFormat(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Search Progress ─── */}
      {searchMutation.isPending && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-muted-foreground text-sm">Searching across multiple sources...</p>
              <div className="flex gap-4 text-xs">
                <span className="text-green-600">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  Internal DB
                </span>
                <span className="text-blue-600">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  Web Search
                </span>
                <span className="text-blue-600">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  Portal Scrape
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Results ─── */}
      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {results.length} result{results.length !== 1 ? "s" : ""} found
          </p>
          {results.map((result) => (
            <ResultCard
              key={result.id}
              result={result}
              onPreview={() => handlePreview(result)}
              onSave={() => handleSave(result.id)}
              isSaving={saveMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ─── Empty State ─── */}
      {!searchMutation.isPending && results.length === 0 && searchId && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="text-muted-foreground mx-auto mb-3 h-12 w-12" />
            <h3 className="text-lg font-medium">No results found</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Try different keywords or a broader query
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["NEET 2024 question paper", "GPAT syllabus", "Pharmacology MCQs"].map(
                (suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery(suggestion);
                      handleSearch(suggestion);
                    }}
                  >
                    {suggestion}
                  </Button>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Search History ─── */}
      {results.length === 0 && !searchMutation.isPending && !searchId && (
        <div className="space-y-3">
          {historyQuery.data && historyQuery.data.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">Recent Searches</h3>
              <div className="flex flex-wrap gap-2">
                {historyQuery.data.map((h) => (
                  <Button
                    key={h.id}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery(h.queryText);
                      handleSearch(h.queryText);
                    }}
                  >
                    <Search className="mr-1 h-3 w-3" />
                    {h.queryText}
                    {h.resultsCount ? (
                      <Badge variant="secondary" className="ml-2">
                        {h.resultsCount}
                      </Badge>
                    ) : null}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Preview Sheet ─── */}
      <Sheet open={!!previewResult} onOpenChange={() => setPreviewResult(null)}>
        <SheetContent className="w-[500px] overflow-y-auto sm:max-w-[500px]">
          {previewResult && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{previewResult.title}</SheetTitle>
                <SheetDescription className="text-left">
                  {previewResult.sourceName ?? previewResult.sourceDomain}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <QualityBadge quality={previewResult.sourceQuality} />
                  <Badge variant="outline">{previewResult.contentType}</Badge>
                </div>

                {!previewResult.sourceUrl.startsWith("internal://") && (
                  <a
                    href={previewResult.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Open Source <ExternalLink className="inline h-3 w-3" />
                  </a>
                )}

                <div className="rounded-md border p-4">
                  {previewMutation.isPending ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : previewText ? (
                    <p className="whitespace-pre-wrap text-sm">{previewText}</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">Preview not available</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleSave(previewResult.id)}
                    disabled={saveMutation.isPending}
                  >
                    <Bookmark className="mr-2 h-4 w-4" />
                    Save to Library
                  </Button>
                  <Button variant="outline" onClick={() => setPreviewResult(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Result Card ───

function ResultCard({
  result,
  onPreview,
  onSave,
  isSaving,
}: {
  result: SearchResult;
  onPreview: () => void;
  onSave: () => void;
  isSaving: boolean;
}): React.ReactElement {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start gap-4 py-4">
        <div className="mt-1">
          <ContentTypeIcon type={result.contentType} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium leading-tight">{result.title}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {result.sourceDomain ?? result.sourceName}
                </span>
                <QualityBadge quality={result.sourceQuality} />
              </div>
            </div>
            <MatchDot quality={result.matchQuality} />
          </div>

          {result.snippet && (
            <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{result.snippet}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {"year" in (result.metadata ?? {}) && result.metadata?.year != null && (
              <Badge variant="secondary" className="text-xs">
                {String(result.metadata.year)}
              </Badge>
            )}
            {"questionCount" in (result.metadata ?? {}) &&
              result.metadata?.questionCount != null && (
                <Badge variant="secondary" className="text-xs">
                  {String(result.metadata.questionCount)} Qs
                </Badge>
              )}
            {"hasAnswers" in (result.metadata ?? {}) && result.metadata?.hasAnswers === true && (
              <Badge variant="secondary" className="text-xs">
                Has Answers
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {result.contentType.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="icon" onClick={onPreview} title="Preview">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onSave} disabled={isSaving} title="Save">
            <Bookmark className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
