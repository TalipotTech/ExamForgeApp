"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Check,
  Bell,
  Globe,
  Calendar,
  Bot,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { EXAM_PORTALS } from "@examforge/shared/constants";

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "…" : url;
  }
}

// ─── Constants ───

const AI_PROVIDERS = [
  { value: "auto", label: "Auto (Recommended)" },
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "google", label: "Gemini (Google)" },
  { value: "openai", label: "GPT-4o (OpenAI)" },
  { value: "mistral", label: "Mistral Large" },
] as const;

const CRAWLER_TYPES = [
  { value: "auto", label: "Auto (Recommended)" },
  { value: "cheerio", label: "Cheerio (Fast, HTML only)" },
  { value: "playwright", label: "Playwright (JS rendering)" },
] as const;

const STATUS_BADGES: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  draft: { variant: "secondary", label: "Draft" },
  upcoming: { variant: "default", label: "Upcoming" },
  active: { variant: "default", label: "Active" },
  past: { variant: "outline", label: "Past" },
};

const CONFIDENCE_DISPLAY: Record<string, { prefix: string; suffix: string; className: string }> = {
  confirmed: { prefix: "", suffix: " \u2713", className: "text-green-600" },
  approximate: { prefix: "~", suffix: "", className: "text-yellow-600" },
  inferred: { prefix: "~", suffix: " ?", className: "text-orange-500" },
  unknown: { prefix: "", suffix: "", className: "text-muted-foreground" },
};

const NOTIFICATION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "date_change", label: "Date Change" },
  { value: "registration_open", label: "Registration Open" },
  { value: "result_declared", label: "Result Declared" },
  { value: "syllabus_update", label: "Syllabus Update" },
  { value: "admit_card", label: "Admit Card" },
  { value: "new_exam", label: "New Exam" },
  { value: "pattern_change", label: "Pattern Change" },
  { value: "correction_window", label: "Correction Window" },
] as const;

// ─── Helpers ───

function formatDate(d: string | Date | null, confidence?: string | null): string {
  if (!d) return "TBA";
  const date = typeof d === "string" ? new Date(d) : d;
  const formatted = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const conf = CONFIDENCE_DISPLAY[confidence ?? "unknown"];
  return `${conf?.prefix ?? ""}${formatted}${conf?.suffix ?? ""}`;
}

function formatRelative(d: string | Date | null): string {
  if (!d) return "Never";
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const RUN_STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="size-4 text-green-600" />,
  failed: <XCircle className="size-4 text-red-600" />,
  running: <Loader2 className="size-4 animate-spin text-blue-600" />,
};

// ─── Main Page ───

export default function DiscoveryPage(): React.ReactElement {
  // Config state
  const [selectedPortals, setSelectedPortals] = useState<string[]>(EXAM_PORTALS.map((p) => p.url));
  const [aiProvider, setAiProvider] = useState("auto");
  const [maxPages, setMaxPages] = useState(3);
  const [crawlerType, setCrawlerType] = useState("auto");

  // Results & error state
  const [error, setError] = useState<string | null>(null);

  // Tab search/filter state
  const [examSearch, setExamSearch] = useState("");
  const [examStatusFilter, setExamStatusFilter] = useState("all");
  const [notifSearch, setNotifSearch] = useState("");
  const [notifTypeFilter, setNotifTypeFilter] = useState("all");

  // Expanded discovery run rows
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Queries
  const runsQuery = trpc.exam.getDiscoveryRuns.useQuery({ limit: 20 });
  const discoveredExamsQuery = trpc.exam.getDiscoveredExams.useQuery({
    search: examSearch || undefined,
    status: (examStatusFilter === "all" ? undefined : examStatusFilter) as
      | "upcoming"
      | "active"
      | "past"
      | "draft"
      | undefined,
    limit: 50,
  });
  const notificationsQuery = trpc.exam.getAllNotifications.useQuery({
    search: notifSearch || undefined,
    type: notifTypeFilter === "all" ? undefined : notifTypeFilter,
    limit: 50,
  });

  // Mutations
  const discoveryMutation = trpc.exam.runDiscovery.useMutation({
    onSuccess: () => {
      setError(null);
      runsQuery.refetch();
      discoveredExamsQuery.refetch();
      notificationsQuery.refetch();
    },
    onError: (err) => {
      setError(`Discovery failed: ${err.message}`);
    },
  });

  const approveMutation = trpc.exam.approveExam.useMutation({
    onSuccess: () => discoveredExamsQuery.refetch(),
  });

  function handleRunDiscovery(): void {
    setError(null);
    discoveryMutation.mutate({
      portals: selectedPortals.length === EXAM_PORTALS.length ? undefined : selectedPortals,
      aiProvider: aiProvider as "auto" | "anthropic" | "openai" | "google" | "mistral",
      maxPagesPerPortal: maxPages,
      crawlerType: crawlerType as "auto" | "cheerio" | "playwright",
    });
  }

  function togglePortal(url: string): void {
    setSelectedPortals((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  function toggleAllPortals(): void {
    setSelectedPortals((prev) =>
      prev.length === EXAM_PORTALS.length ? [] : EXAM_PORTALS.map((p) => p.url),
    );
  }

  const runs = runsQuery.data ?? [];
  const discoveredExams = discoveredExamsQuery.data?.exams ?? [];
  const notifications = notificationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={"/scraper" as "/"}>
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discovery Agent</h1>
          <p className="text-muted-foreground text-sm">
            Discover exams from Indian education portals using AI analysis
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Discovery Config Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-5" />
            Discovery Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* AI Provider */}
            <div className="space-y-1.5">
              <Label className="text-sm">AI Provider</Label>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger className="h-9">
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

            {/* Crawler Type */}
            <div className="space-y-1.5">
              <Label className="text-sm">Crawler Type</Label>
              <Select value={crawlerType} onValueChange={setCrawlerType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRAWLER_TYPES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Crawl Depth */}
            <div className="space-y-1.5">
              <Label className="text-sm">Pages per Portal</Label>
              <Input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Math.max(1, Math.min(10, Number(e.target.value))))}
                min={1}
                max={10}
                className="h-9"
              />
            </div>
          </div>

          {/* Portal Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Portals to Scan</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAllPortals}>
                {selectedPortals.length === EXAM_PORTALS.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {EXAM_PORTALS.map((portal) => (
                <label
                  key={portal.url}
                  className={`hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selectedPortals.includes(portal.url) ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <Checkbox
                    checked={selectedPortals.includes(portal.url)}
                    onCheckedChange={() => togglePortal(portal.url)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{portal.name}</span>
                      {portal.preferredCrawler === "playwright" && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          JS
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {portal.focusAreas.join(", ")}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Run Button */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleRunDiscovery}
              disabled={discoveryMutation.isPending || selectedPortals.length === 0}
              className="gap-2"
            >
              {discoveryMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {discoveryMutation.isPending ? "Discovering..." : "Run Discovery Agent"}
            </Button>
            {selectedPortals.length === 0 && (
              <p className="text-xs text-red-500">Select at least one portal</p>
            )}
            {discoveryMutation.isPending && (
              <p className="text-muted-foreground text-xs">
                Scanning {selectedPortals.length} portal{selectedPortals.length > 1 ? "s" : ""}...
              </p>
            )}
          </div>

          {/* Discovery Result Summary */}
          {discoveryMutation.isSuccess && discoveryMutation.data && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                <CheckCircle2 className="size-4" />
                Discovery Complete
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-muted-foreground text-xs">Portals</p>
                  <p className="font-semibold">{discoveryMutation.data.portalsChecked.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Exams Found</p>
                  <p className="font-semibold">{discoveryMutation.data.examsFound}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">New</p>
                  <p className="font-semibold text-green-600">{discoveryMutation.data.examsNew}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Notifications</p>
                  <p className="font-semibold">{discoveryMutation.data.notificationsCreated}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Cost</p>
                  <p className="font-semibold">${discoveryMutation.data.totalCost.toFixed(4)}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs" className="gap-1.5">
            <Clock className="size-3.5" />
            Discovery Runs
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-1.5">
            <Calendar className="size-3.5" />
            Discovered Exams
            {discoveredExams.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {discoveredExamsQuery.data?.total ?? 0}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="size-3.5" />
            Notifications
            {notifications.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {notifications.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Discovery Runs Tab ─── */}
        <TabsContent value="runs">
          <Card>
            <CardContent className="pt-4">
              {runsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
                  <Globe className="mb-3 size-10 opacity-50" />
                  <p className="text-sm">No discovery runs yet</p>
                  <p className="mt-1 text-xs">Configure and run the discovery agent above</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Portals</TableHead>
                      <TableHead>Exams</TableHead>
                      <TableHead>Notifications</TableHead>
                      <TableHead>AI Provider</TableHead>
                      <TableHead>Crawler</TableHead>
                      <TableHead>Depth</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => {
                      const duration = run.completedAt
                        ? Math.round(
                            (new Date(run.completedAt).getTime() -
                              new Date(run.startedAt).getTime()) /
                              1000,
                          )
                        : null;
                      const isExpanded = expandedRunId === run.id;

                      return (
                        <Fragment key={run.id}>
                          <TableRow
                            className="hover:bg-muted/50 cursor-pointer"
                            onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                          >
                            <TableCell>
                              {isExpanded ? (
                                <ChevronUp className="size-3.5" />
                              ) : (
                                <ChevronDown className="size-3.5" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(run.startedAt).toLocaleString("en-IN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {RUN_STATUS_ICON[run.status] ?? (
                                  <AlertTriangle className="size-4 text-yellow-500" />
                                )}
                                <span className="text-sm capitalize">{run.status}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {(run.portalsChecked as string[]).length}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {run.examsFound ?? 0}
                                {(run.examsNew ?? 0) > 0 && (
                                  <span className="ml-1 text-green-600">(+{run.examsNew})</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {run.notificationsCreated ?? 0}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {run.aiProvider ?? "auto"}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {run.crawlerType ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {run.maxPagesPerPortal ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {(run.aiTokensUsed ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              ${(run.aiCostUsd ?? 0).toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {duration !== null ? `${duration}s` : "—"}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={12} className="bg-muted/30 p-4">
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <span className="font-medium">Portals checked: </span>
                                    {(run.portalsChecked as string[]).join(", ")}
                                  </div>
                                  {run.examsUpdated !== null && run.examsUpdated !== undefined && (
                                    <div>
                                      <span className="font-medium">Exams updated: </span>
                                      {run.examsUpdated}
                                    </div>
                                  )}
                                  {run.errorLog &&
                                    Array.isArray(run.errorLog) &&
                                    (run.errorLog as Array<{ time: string; message: string }>)
                                      .length > 0 && (
                                      <div>
                                        <span className="font-medium text-red-500">Errors:</span>
                                        <pre className="bg-muted mt-1 max-h-32 overflow-auto rounded p-2 font-mono text-xs">
                                          {(
                                            run.errorLog as Array<{ time: string; message: string }>
                                          )
                                            .map((e) => `[${e.time}] ${e.message}\n`)
                                            .join("")}
                                        </pre>
                                      </div>
                                    )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Discovered Exams Tab ─── */}
        <TabsContent value="exams">
          <Card>
            <CardContent className="space-y-4 pt-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[200px] flex-1">
                  <Input
                    placeholder="Search exams..."
                    value={examSearch}
                    onChange={(e) => setExamSearch(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Select value={examStatusFilter} onValueChange={setExamStatusFilter}>
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past">Past</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Exams Table */}
              {discoveredExamsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : discoveredExams.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
                  <Calendar className="mb-3 size-10 opacity-50" />
                  <p className="text-sm">No discovered exams yet</p>
                  <p className="mt-1 text-xs">Run the discovery agent to find exams from portals</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Exam Date</TableHead>
                      <TableHead>Conducting Body</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Checked</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discoveredExams.map((exam) => {
                      const statusInfo =
                        STATUS_BADGES[exam.status ?? "draft"] ?? STATUS_BADGES.draft;
                      const confInfo = CONFIDENCE_DISPLAY[exam.dateConfidence ?? "unknown"] ?? {
                        prefix: "",
                        suffix: "",
                        className: "text-muted-foreground",
                      };

                      return (
                        <TableRow key={exam.id}>
                          <TableCell>
                            <div className="font-medium">{exam.name}</div>
                            {exam.tags && (exam.tags as string[]).length > 0 && (
                              <div className="mt-0.5 flex gap-1">
                                {(exam.tags as string[]).slice(0, 3).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="px-1 py-0 text-[10px]"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm capitalize">{exam.category}</TableCell>
                          <TableCell>
                            <Badge variant={statusInfo!.variant}>{statusInfo!.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm ${confInfo.className}`}>
                              {formatDate(exam.examDate, exam.dateConfidence)}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {exam.conductingBody ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[120px] truncate font-mono text-xs">
                            {exam.discoverySource ? safeHostname(exam.discoverySource) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatRelative(exam.lastCheckedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {exam.status === "draft" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() =>
                                    approveMutation.mutate({ id: exam.id, status: "upcoming" })
                                  }
                                  disabled={approveMutation.isPending}
                                >
                                  <Check className="size-3" />
                                  Approve
                                </Button>
                              )}
                              {exam.officialUrl && (
                                <a
                                  href={exam.officialUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button variant="ghost" size="icon" className="size-7">
                                    <ExternalLink className="size-3.5" />
                                  </Button>
                                </a>
                              )}
                              <Link href={`/exams/${exam.id}` as "/"}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  View
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {/* Pagination info */}
              {discoveredExamsQuery.data && discoveredExamsQuery.data.total > 0 && (
                <p className="text-muted-foreground text-center text-xs">
                  Showing {discoveredExams.length} of {discoveredExamsQuery.data.total} discovered
                  exams
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Notifications Tab ─── */}
        <TabsContent value="notifications">
          <Card>
            <CardContent className="space-y-4 pt-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[200px] flex-1">
                  <Input
                    placeholder="Search notifications..."
                    value={notifSearch}
                    onChange={(e) => setNotifSearch(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Select value={notifTypeFilter} onValueChange={setNotifTypeFilter}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notifications List */}
              {notificationsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
                  <Bell className="mb-3 size-10 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                  <p className="mt-1 text-xs">
                    Notifications appear when exams have date changes, registrations, etc.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        notif.isImportant
                          ? "border-yellow-300 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/30"
                          : ""
                      }`}
                    >
                      <div className="mt-0.5">
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap text-[10px] capitalize"
                        >
                          {(notif.type ?? "").replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{notif.title}</span>
                          {notif.isImportant && (
                            <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                              Important
                            </Badge>
                          )}
                        </div>
                        {notif.examName && (
                          <p className="text-primary mt-0.5 text-xs">{notif.examName}</p>
                        )}
                        {notif.description && (
                          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                            {notif.description}
                          </p>
                        )}
                        <div className="text-muted-foreground mt-1.5 flex items-center gap-3 text-xs">
                          <span>{formatRelative(notif.detectedAt)}</span>
                          {notif.sourceUrl && (
                            <a
                              href={notif.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="size-3" />
                              Source
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
