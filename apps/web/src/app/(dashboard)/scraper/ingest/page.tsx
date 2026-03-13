"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Key,
  FileQuestion,
  BookOpen,
  RefreshCw,
  Search,
  Play,
  Eye,
  ChevronLeft,
  ChevronRight,
  Expand,
  Trash2,
} from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

// ─── Constants ───

const PAGE_TYPES = [
  { value: "examinations", label: "Examinations" },
  { value: "previous_questions", label: "Question Papers" },
  { value: "omr_answer_key", label: "OMR Keys" },
  { value: "online_answer_key", label: "Online Keys" },
  { value: "descriptive_questions", label: "Descriptive" },
  { value: "syllabus", label: "Syllabus" },
  { value: "notification", label: "Notification" },
] as const;

const TAB_PAGE_TYPES = [
  { value: "all", label: "All" },
  { value: "previous_questions", label: "Question Papers" },
  { value: "omr_answer_key", label: "OMR Keys" },
  { value: "online_answer_key", label: "Online Keys" },
  { value: "descriptive_questions", label: "Descriptive" },
  { value: "syllabus", label: "Syllabus" },
  { value: "examinations", label: "Examinations" },
] as const;

const KERALA_PSC_QUICK_LINKS = [
  {
    label: "Question Papers",
    url: "https://keralapsc.gov.in/previous-question-papers",
    pageType: "previous_questions" as const,
    icon: FileQuestion,
  },
  {
    label: "OMR Answer Keys",
    url: "https://keralapsc.gov.in/answerkey_omrexams",
    pageType: "omr_answer_key" as const,
    icon: Key,
  },
  {
    label: "Online Answer Keys",
    url: "https://keralapsc.gov.in/answerkey_onlineexams",
    pageType: "online_answer_key" as const,
    icon: Key,
  },
  {
    label: "Descriptive Papers",
    url: "https://keralapsc.gov.in/question-paper-descriptive-exam",
    pageType: "descriptive_questions" as const,
    icon: BookOpen,
  },
  {
    label: "Examinations",
    url: "https://keralapsc.gov.in/examinations",
    pageType: "examinations" as const,
    icon: ClipboardList,
  },
] as const;

// ─── Badge helpers ───

function statusBadge(status: string): React.ReactElement {
  const variants: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
  > = {
    discovered: { variant: "outline", label: "Discovered" },
    downloading: { variant: "secondary", label: "Downloading" },
    downloaded: { variant: "secondary", label: "Downloaded" },
    extracting: { variant: "secondary", label: "Extracting" },
    processed: { variant: "default", label: "Processed" },
    error: { variant: "destructive", label: "Error" },
  };
  const cfg = variants[status] ?? { variant: "outline" as const, label: status };
  return (
    <Badge variant={cfg.variant} className="px-1.5 py-0 text-[10px]">
      {cfg.label}
    </Badge>
  );
}

function docTypeBadge(type: string): React.ReactElement {
  const labels: Record<string, string> = {
    question_paper_mcq: "MCQ",
    question_paper_descriptive: "Desc",
    answer_key_omr: "OMR",
    answer_key_online: "Online",
    examination_schedule: "Exam",
    syllabus: "Syllabus",
    notification: "Notif",
    other: "Other",
  };
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
      {labels[type] ?? type}
    </Badge>
  );
}

function docTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    question_paper_mcq: "MCQ Paper",
    question_paper_descriptive: "Descriptive Paper",
    answer_key_omr: "OMR Answer Key",
    answer_key_online: "Online Answer Key",
    examination_schedule: "Examination Schedule",
    syllabus: "Syllabus",
    notification: "Notification",
    other: "Other",
  };
  return labels[type] ?? type;
}

// ─── Helpers ───

/** Convert string to Title Case and strip "Download" noise */
function formatTitle(raw: string | null): string {
  if (!raw) return "Untitled";
  const cleaned = raw
    .replace(/\s*[-–—]\s*download\s*$/i, "")
    .replace(/\s*\(\s*download\s*\)\s*$/i, "")
    .replace(/\s*download\s*$/i, "")
    .trim();
  return cleaned
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 2 && w === w.toUpperCase()) return w; // Keep acronyms like "II", "IV"
      if (w === w.toUpperCase() && w.length > 2) {
        // ALL CAPS word → Title Case (e.g., "LABORATORY" → "Laboratory")
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      // Already mixed case, just capitalize first letter
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// ─── Types ───

type PageType = (typeof PAGE_TYPES)[number]["value"];

type DocRow = {
  id: string;
  portalName: string | null;
  sourcePageType: string | null;
  documentType: string;
  title: string | null;
  examName: string | null;
  examYear: number | null;
  processingStatus: string;
  questionsExtracted: number | null;
  answersMatched: number | null;
  originalUrl: string;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  createdAt: string;
  linkedExamName: string | null;
};

// ─── Row Detail Dialog ───

function RowDetailDialog({
  doc,
  open,
  onClose,
  onProcess,
  onReprocess,
  onViewQuestions,
  isPending,
}: {
  doc: DocRow | null;
  open: boolean;
  onClose: () => void;
  onProcess: (id: string) => void;
  onReprocess: (id: string) => void;
  onViewQuestions: (id: string) => void;
  isPending: boolean;
}): React.ReactElement {
  if (!doc) return <></>;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium leading-snug">
            {formatTitle(doc.title)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="mt-0.5">{statusBadge(doc.processingStatus)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Type</span>
              <div className="mt-0.5">{docTypeLabel(doc.documentType)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Portal</span>
              <div className="mt-0.5">{doc.portalName ?? "-"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Year</span>
              <div className="mt-0.5">{doc.examYear ?? "-"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Exam name</span>
              <div className="mt-0.5">{doc.examName ?? "-"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Linked exam</span>
              <div className="mt-0.5">{doc.linkedExamName ?? "-"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Questions</span>
              <div className="mt-0.5">
                {(doc.questionsExtracted ?? 0) > 0 ? `${doc.questionsExtracted} extracted` : "-"}
                {(doc.answersMatched ?? 0) > 0 && ` (${doc.answersMatched} matched)`}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">File size</span>
              <div className="mt-0.5">
                {doc.fileSizeBytes ? `${(doc.fileSizeBytes / 1024).toFixed(0)} KB` : "-"}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Source page type</span>
              <div className="mt-0.5">{doc.sourcePageType ?? "-"}</div>
            </div>
          </div>

          {/* Error message */}
          {doc.errorMessage && (
            <div className="bg-destructive/10 text-destructive rounded p-2 text-[11px]">
              {doc.errorMessage}
            </div>
          )}

          {/* URL */}
          <div>
            <span className="text-muted-foreground">PDF URL</span>
            <div className="mt-0.5 truncate text-[11px] text-blue-600">
              <a href={doc.originalUrl} target="_blank" rel="noopener noreferrer">
                {doc.originalUrl}
              </a>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 border-t pt-2">
            {doc.processingStatus === "discovered" && (
              <Button
                size="sm"
                onClick={() => onProcess(doc.id)}
                disabled={isPending}
                className="h-7 gap-1 text-xs"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Process
              </Button>
            )}
            {doc.processingStatus === "processed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewQuestions(doc.id)}
                className="h-7 gap-1 text-xs"
              >
                <Eye className="h-3 w-3" />
                View questions
              </Button>
            )}
            {doc.processingStatus === "error" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReprocess(doc.id)}
                disabled={isPending}
                className="h-7 gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                Reprocess
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(doc.originalUrl, "_blank")}
              className="h-7 gap-1 text-xs"
            >
              <FileText className="h-3 w-3" />
              Open PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───

export default function PortalIngestPage(): React.ReactElement {
  const router = useRouter();

  // Form state
  const [url, setUrl] = useState("");
  const [portalName, setPortalName] = useState("Kerala PSC");
  const [pageType, setPageType] = useState<PageType>("previous_questions");

  // Discovery state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  // Tab + filter state
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail dialog state
  const [detailDoc, setDetailDoc] = useState<DocRow | null>(null);

  // ─── Queries ───

  const statsQuery = trpc.portalIngestion.getStats.useQuery();

  const sourcePageType = activeTab === "all" ? undefined : activeTab;
  const processingStatus = statusFilter === "all" ? undefined : statusFilter;

  const docsQuery = trpc.portalIngestion.getPortalDocuments.useQuery(
    {
      sourcePageType,
      processingStatus,
      page: currentPage,
      limit: 25,
    },
    { refetchInterval: activeRunId ? 3000 : false },
  );

  const runStatusQuery = trpc.portalIngestion.getRunStatus.useQuery(
    { runId: activeRunId! },
    { enabled: !!activeRunId, refetchInterval: 2000 },
  );

  // ─── Mutations ───

  const ingestMutation = trpc.portalIngestion.ingestPortal.useMutation({
    onSuccess: (data) => {
      setActiveRunId(data.runId);
      setIngesting(false);
    },
    onError: () => {
      setIngesting(false);
    },
  });

  const processDocsMutation = trpc.portalIngestion.processDocuments.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      docsQuery.refetch();
      statsQuery.refetch();
    },
  });

  const processAllMutation = trpc.portalIngestion.processAllByPageType.useMutation({
    onSuccess: () => {
      docsQuery.refetch();
      statsQuery.refetch();
    },
  });

  const reprocessMutation = trpc.portalIngestion.reprocessDocument.useMutation({
    onSuccess: () => {
      docsQuery.refetch();
    },
  });

  const clearDataMutation = trpc.portalIngestion.clearData.useMutation({
    onSuccess: () => {
      docsQuery.refetch();
      statsQuery.refetch();
    },
  });

  // ─── Effects ───

  useEffect(() => {
    if (runStatusQuery.data?.status === "completed" || runStatusQuery.data?.status === "failed") {
      setActiveRunId(null);
      docsQuery.refetch();
      statsQuery.refetch();
    }
  }, [runStatusQuery.data?.status]);

  useEffect(() => {
    if (!url) return;
    try {
      const domain = new URL(url).hostname;
      if (domain.includes("keralapsc")) setPortalName("Kerala PSC");
      else if (domain.includes("nta.ac.in")) setPortalName("NTA");
      else if (domain.includes("upsc.gov.in")) setPortalName("UPSC");
      else setPortalName(domain.replace("www.", ""));
    } catch {
      // Invalid URL, ignore
    }
  }, [url]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [activeTab, statusFilter]);

  // ─── Handlers ───

  function handleQuickLink(quickUrl: string, quickPageType: PageType): void {
    setUrl(quickUrl);
    setPageType(quickPageType);
    setPortalName("Kerala PSC");
  }

  function handleDiscover(): void {
    if (!url) return;
    setIngesting(true);
    ingestMutation.mutate({ url, portalName, pageType });
  }

  function handleProcessSelected(): void {
    if (selectedIds.size === 0) return;
    processDocsMutation.mutate({ documentIds: Array.from(selectedIds) });
  }

  function handleProcessAllDiscovered(): void {
    if (activeTab === "all") return;
    processAllMutation.mutate({
      sourcePageType: activeTab,
      portalName: portalName || undefined,
    });
  }

  function handleClearData(): void {
    const scope = activeTab === "all" ? undefined : activeTab;
    const label =
      activeTab === "all"
        ? "ALL portal documents and staged questions"
        : `all "${TAB_PAGE_TYPES.find((t) => t.value === activeTab)?.label ?? activeTab}" documents`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }
    clearDataMutation.mutate(scope ? { sourcePageType: scope } : undefined);
  }

  const toggleSelect = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((): void => {
    if (!docsQuery.data) return;
    const discoveredIds = docsQuery.data.documents
      .filter((d) => d.processingStatus === "discovered")
      .map((d) => d.id);

    setSelectedIds((prev) => {
      const allSelected = discoveredIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(discoveredIds);
    });
  }, [docsQuery.data]);

  // ─── Filtered data ───

  const documents = (docsQuery.data?.documents ?? []) as DocRow[];
  const filteredDocs = searchQuery
    ? documents.filter(
        (d) =>
          d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.examName?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : documents;

  const discoveredCount = filteredDocs.filter((d) => d.processingStatus === "discovered").length;

  const stats = statsQuery.data;
  const runStatus = runStatusQuery.data;
  const totalPages = Math.ceil((docsQuery.data?.total ?? 0) / 25);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/scraper">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Portal ingestion</h1>
            <p className="text-muted-foreground text-xs">
              Discover documents from exam portals, then process and review
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {[
            { label: "Total", value: stats.totalDocuments },
            { label: "Discovered", value: stats.discoveredDocuments },
            { label: "Processed", value: stats.processedDocuments },
            { label: "Errors", value: stats.errorDocuments },
            { label: "Pending review", value: stats.pendingReview },
            { label: "Approved", value: stats.approvedQuestions },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-muted-foreground text-[10px]">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Discovery Form */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-4">
          <CardTitle className="text-sm">Discover documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {/* Quick Links */}
          <div>
            <Label className="text-muted-foreground mb-1 block text-[10px]">
              Kerala PSC quick discover
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {KERALA_PSC_QUICK_LINKS.map((link) => (
                <Button
                  key={link.pageType}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLink(link.url, link.pageType)}
                  className="h-7 gap-1 text-xs"
                >
                  <link.icon className="h-3 w-3" />
                  {link.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="url" className="text-xs">
                Portal URL
              </Label>
              <Input
                id="url"
                placeholder="https://keralapsc.gov.in/previous-question-papers"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="portalName" className="text-xs">
                Portal name
              </Label>
              <Input
                id="portalName"
                value={portalName}
                onChange={(e) => setPortalName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Page type</Label>
              <Select value={pageType} onValueChange={(v) => setPageType(v as PageType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value} className="text-xs">
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleDiscover}
            disabled={!url || ingesting || !!activeRunId}
            className="h-8 gap-1.5 text-xs"
          >
            {ingesting || activeRunId ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {activeRunId ? "Discovering..." : "Discover documents"}
          </Button>

          {ingestMutation.error && (
            <p className="text-destructive text-xs">{ingestMutation.error.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Active Discovery Progress */}
      {activeRunId && runStatus && (
        <Card>
          <CardContent className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Discovery progress</span>
              <span className="text-muted-foreground">{runStatus.status}</span>
            </div>
            <Progress
              value={
                runStatus.status === "completed" ? 100 : runStatus.status === "running" ? 50 : 10
              }
              className="h-1.5"
            />
            {runStatus.status === "completed" && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Discovery complete
              </div>
            )}
            {runStatus.status === "failed" && (
              <div className="text-destructive flex items-center gap-1.5 text-xs">
                <XCircle className="h-3 w-3" />
                Discovery failed
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Document History — Tabbed */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-4">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Document history</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => docsQuery.refetch()}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto flex-wrap gap-0.5">
              {TAB_PAGE_TYPES.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="h-7 px-2.5 text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Filters + Bulk Actions */}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 gap-1.5">
                <div className="relative max-w-xs flex-1">
                  <Search className="text-muted-foreground absolute left-2 top-2 h-3 w-3" />
                  <Input
                    placeholder="Search title or exam..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 pl-7 text-xs"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      All statuses
                    </SelectItem>
                    <SelectItem value="discovered" className="text-xs">
                      Discovered
                    </SelectItem>
                    <SelectItem value="downloading" className="text-xs">
                      Downloading
                    </SelectItem>
                    <SelectItem value="processed" className="text-xs">
                      Processed
                    </SelectItem>
                    <SelectItem value="error" className="text-xs">
                      Error
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk actions */}
              <div className="flex gap-1.5">
                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    onClick={handleProcessSelected}
                    disabled={processDocsMutation.isPending}
                    className="h-7 gap-1 text-xs"
                  >
                    {processDocsMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Process selected ({selectedIds.size})
                  </Button>
                )}
                {activeTab !== "all" && discoveredCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleProcessAllDiscovered}
                    disabled={processAllMutation.isPending}
                    className="h-7 gap-1 text-xs"
                  >
                    {processAllMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Process all discovered
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive h-7 gap-1 text-xs"
                  onClick={handleClearData}
                  disabled={clearDataMutation.isPending}
                >
                  {clearDataMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  {activeTab === "all" ? "Clear all" : "Clear tab"}
                </Button>
              </div>
            </div>

            {/* Document table */}
            {docsQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-xs">
                {searchQuery
                  ? "No documents match your search."
                  : "No documents found. Use the form above to discover documents."}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="text-[11px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-8 px-2">
                          <Checkbox
                            checked={
                              discoveredCount > 0 &&
                              filteredDocs
                                .filter((d) => d.processingStatus === "discovered")
                                .every((d) => selectedIds.has(d.id))
                            }
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all discovered"
                          />
                        </TableHead>
                        <TableHead className="px-2">Title</TableHead>
                        <TableHead className="w-16 px-2">Type</TableHead>
                        <TableHead className="w-12 px-2">Year</TableHead>
                        <TableHead className="w-20 px-2">Status</TableHead>
                        <TableHead className="w-10 px-2">Qty</TableHead>
                        <TableHead className="w-20 px-2">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocs.map((doc) => (
                        <TableRow
                          key={doc.id}
                          className={selectedIds.has(doc.id) ? "bg-muted/50" : undefined}
                        >
                          <TableCell className="px-2 py-1">
                            {doc.processingStatus === "discovered" && (
                              <Checkbox
                                checked={selectedIds.has(doc.id)}
                                onCheckedChange={() => toggleSelect(doc.id)}
                                aria-label={`Select ${doc.title}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className="max-w-[260px] px-2 py-1">
                            <button
                              type="button"
                              className="cursor-pointer text-left font-normal leading-tight hover:underline"
                              onClick={() => router.push(`/scraper/ingest/${doc.id}` as "/")}
                              title={formatTitle(doc.title)}
                            >
                              <span className="line-clamp-1">{formatTitle(doc.title)}</span>
                            </button>
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {docTypeBadge(doc.documentType)}
                          </TableCell>
                          <TableCell className="px-2 py-1">{doc.examYear ?? "-"}</TableCell>
                          <TableCell className="px-2 py-1">
                            {statusBadge(doc.processingStatus)}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center">
                            {(doc.questionsExtracted ?? 0) > 0 ? doc.questionsExtracted : "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <div className="flex gap-0.5">
                              {/* Expand to popup */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setDetailDoc(doc)}
                                title="View details"
                              >
                                <Expand className="h-3 w-3" />
                              </Button>
                              {/* Contextual action */}
                              {doc.processingStatus === "processed" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => router.push(`/scraper/ingest/${doc.id}` as "/")}
                                  title="View questions"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              )}
                              {doc.processingStatus === "discovered" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    processDocsMutation.mutate({
                                      documentIds: [doc.id],
                                    })
                                  }
                                  disabled={processDocsMutation.isPending}
                                  title="Process"
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              {doc.processingStatus === "error" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => reprocessMutation.mutate({ id: doc.id })}
                                  disabled={reprocessMutation.isPending}
                                  title="Reprocess"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-muted-foreground text-[10px]">
                      Page {currentPage} of {totalPages} ({docsQuery.data?.total} total)
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Tabs>

          {/* Mutation feedback */}
          {processDocsMutation.isSuccess && (
            <p className="text-xs text-green-600">
              Queued {processDocsMutation.data.queued} documents for processing.
            </p>
          )}
          {processAllMutation.isSuccess && (
            <p className="text-xs text-green-600">
              Queued {processAllMutation.data.queued} documents for processing.
            </p>
          )}
          {processDocsMutation.error && (
            <p className="text-destructive text-xs">{processDocsMutation.error.message}</p>
          )}
          {clearDataMutation.isSuccess && (
            <p className="text-xs text-green-600">
              Cleared {clearDataMutation.data.deletedDocuments} documents
              {clearDataMutation.data.scope !== "all"
                ? ` from "${clearDataMutation.data.scope}"`
                : " and staged questions"}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* Row Detail Popup */}
      <RowDetailDialog
        doc={detailDoc}
        open={!!detailDoc}
        onClose={() => setDetailDoc(null)}
        onProcess={(id) => {
          processDocsMutation.mutate({ documentIds: [id] });
          setDetailDoc(null);
        }}
        onReprocess={(id) => {
          reprocessMutation.mutate({ id });
          setDetailDoc(null);
        }}
        onViewQuestions={(id) => {
          router.push(`/scraper/ingest/${id}` as "/");
        }}
        isPending={processDocsMutation.isPending || reprocessMutation.isPending}
      />
    </div>
  );
}
