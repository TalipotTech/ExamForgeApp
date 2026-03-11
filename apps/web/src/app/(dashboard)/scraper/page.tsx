"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Plus,
  Search,
  Play,
  Pause,
  Loader2,
  MoreVertical,
  Pencil,
  History,
  Trash2,
  Activity,
  X,
  Save,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

const STATUS_FILTERS = ["all", "active", "paused", "error", "pending", "completed"] as const;

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500",
  paused: "bg-yellow-500",
  error: "bg-red-500",
  pending: "bg-gray-400",
  completed: "bg-blue-500",
};

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

function formatDate(d: string | Date | null): string {
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

// ─── Edit Source Form ───

type EditingSource = {
  id: string;
  name: string;
  url: string;
  examId: string;
  sourceType: string;
  scrapeFrequency: string;
  scrapeDepth: number;
  aiProvider: string;
  notes: string;
};

function EditSourcePanel({
  source,
  exams,
  onSave,
  onCancel,
  isSaving,
}: {
  source: EditingSource;
  exams: Array<{ id: string; name: string }>;
  onSave: (data: EditingSource) => void;
  onCancel: () => void;
  isSaving: boolean;
}): React.ReactElement {
  const [form, setForm] = useState<EditingSource>(source);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Edit Source</CardTitle>
          <Button variant="ghost" size="icon" className="size-7" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target Exam *</Label>
            <Select value={form.examId} onValueChange={(v) => setForm({ ...form, examId: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select exam" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id}>
                    {exam.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">URL</Label>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={form.sourceType}
              onValueChange={(v) => setForm({ ...form, sourceType: v })}
            >
              <SelectTrigger className="h-8 text-sm">
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
          <div className="space-y-1">
            <Label className="text-xs">Frequency</Label>
            <Select
              value={form.scrapeFrequency}
              onValueChange={(v) => setForm({ ...form, scrapeFrequency: v })}
            >
              <SelectTrigger className="h-8 text-sm">
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
          <div className="space-y-1">
            <Label className="text-xs">Depth (pages)</Label>
            <Input
              type="number"
              value={form.scrapeDepth}
              onChange={(e) => setForm({ ...form, scrapeDepth: Number(e.target.value) })}
              min={1}
              max={10}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="text-sm"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1"
            onClick={() => onSave(form)}
            disabled={isSaving || !form.name || !form.url}
          >
            {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
            Save Changes
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Run History Dialog ───

const RUN_STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="size-4 text-green-600" />,
  failed: <XCircle className="size-4 text-red-600" />,
  running: <Loader2 className="size-4 animate-spin text-blue-600" />,
  queued: <Clock className="size-4 text-gray-400" />,
};

function RunHistoryDialog({
  sourceId,
  sourceName,
  open,
  onOpenChange,
}: {
  sourceId: string;
  sourceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const runsQuery = trpc.scrapeSource.getRuns.useQuery({ sourceId, limit: 20 }, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" />
            Run History — {sourceName}
          </DialogTitle>
        </DialogHeader>
        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          {runsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !runsQuery.data || runsQuery.data.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <History className="mb-3 size-10 opacity-50" />
              <p className="text-sm">No scrape runs yet</p>
              <p className="mt-1 text-xs">Start a scrape to see history here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runsQuery.data.map((run) => (
                <div key={run.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <div className="mt-0.5">
                    {RUN_STATUS_ICON[run.status] ?? (
                      <AlertTriangle className="size-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{run.status}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(run.startedAt).toLocaleString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span>Pages: {run.pagesVisited ?? 0}</span>
                      <span>Questions: {run.questionsFound ?? 0}</span>
                      <span className="text-green-600">New: {run.questionsNew ?? 0}</span>
                      <span className="text-yellow-600">Dupes: {run.questionsDuplicate ?? 0}</span>
                      {run.pagesFailed ? (
                        <span className="text-red-600">Failed: {run.pagesFailed}</span>
                      ) : null}
                    </div>
                    {run.aiProvider && (
                      <div className="text-muted-foreground mt-1 text-xs">
                        AI: {run.aiProvider}
                        {run.aiTokensUsed ? ` · ${run.aiTokensUsed.toLocaleString()} tokens` : ""}
                        {run.aiCostUsd ? ` · $${Number(run.aiCostUsd).toFixed(4)}` : ""}
                      </div>
                    )}
                    {run.completedAt && (
                      <div className="text-muted-foreground mt-1 text-xs">
                        Duration:{" "}
                        {Math.round(
                          (new Date(run.completedAt).getTime() -
                            new Date(run.startedAt).getTime()) /
                            1000,
                        )}
                        s
                      </div>
                    )}
                    {run.errorLog && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-red-500 hover:underline">
                          Error details
                        </summary>
                        <pre className="bg-muted mt-1 max-h-24 overflow-auto rounded p-2 text-xs">
                          {typeof run.errorLog === "string"
                            ? run.errorLog
                            : JSON.stringify(run.errorLog, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───

export default function ScraperManagerPage(): React.ReactElement {
  const [filter, setFilter] = useState<string>("all");
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [historySourceId, setHistorySourceId] = useState<string | null>(null);

  const statsQuery = trpc.scrapeSource.getStats.useQuery();
  const examsQuery = trpc.scrapeSource.exams.useQuery();
  const sourcesQuery = trpc.scrapeSource.list.useQuery(
    filter === "all"
      ? undefined
      : { status: filter as "active" | "paused" | "error" | "pending" | "completed" },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        const hasActive = data?.some((s) => s.status === "active");
        return hasActive ? 5000 : false;
      },
    },
  );

  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const startScrapeMutation = trpc.scrapeSource.startScrape.useMutation({
    onSuccess: () => {
      setScrapeError(null);
      sourcesQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => {
      setScrapeError(err.message);
    },
  });

  const pauseMutation = trpc.scrapeSource.pauseSource.useMutation({
    onSuccess: () => sourcesQuery.refetch(),
  });

  const deleteMutation = trpc.scrapeSource.delete.useMutation({
    onSuccess: () => {
      sourcesQuery.refetch();
      statsQuery.refetch();
    },
  });

  const updateMutation = trpc.scrapeSource.update.useMutation({
    onSuccess: () => {
      setEditingSourceId(null);
      sourcesQuery.refetch();
    },
    onError: (err) => {
      setScrapeError(err.message);
    },
  });

  const sources = sourcesQuery.data ?? [];
  const stats = statsQuery.data;

  const runsQuery = trpc.scrapeSource.getRuns.useQuery(
    { sourceId: sources.find((s) => s.status === "active")?.id ?? "", limit: 10 },
    {
      enabled: sources.some((s) => s.status === "active"),
      refetchInterval: 3000,
    },
  );

  function handleEditClick(src: (typeof sources)[number]): void {
    setEditingSourceId(src.id);
  }

  function handleEditSave(form: EditingSource): void {
    updateMutation.mutate({
      id: form.id,
      name: form.name,
      url: form.url,
      examId: form.examId || null,
      sourceType: form.sourceType as
        | "question_bank"
        | "previous_year"
        | "mock_test"
        | "syllabus"
        | "notes"
        | "portal",
      scrapeFrequency: form.scrapeFrequency as "manual" | "daily" | "weekly" | "monthly",
      scrapeDepth: form.scrapeDepth,
      aiProvider: form.aiProvider,
      notes: form.notes || null,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scraper Manager</h1>
          <p className="text-muted-foreground text-sm">
            Manage question sources and monitor scraping activity
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={"/scraper/discovery" as "/"}>
            <Button variant="outline" className="gap-2">
              <Search className="size-4" />
              Discovery Agent
            </Button>
          </Link>
          <Link href={"/scraper/add" as "/"}>
            <Button className="gap-2">
              <Plus className="size-4" />
              Add Source
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total Sources
              </p>
              <p className="text-primary mt-1 text-3xl font-bold">{stats.totalSources}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Active Sources
              </p>
              <p className="mt-1 text-3xl font-bold text-green-600">{stats.activeSources}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total Questions
              </p>
              <p className="mt-1 text-3xl font-bold text-yellow-600">
                {stats.totalQuestionsScraped.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Today&apos;s Yield
              </p>
              <p className="mt-1 text-3xl font-bold text-purple-600">+{stats.todayYield}</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error Banner */}
      {scrapeError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>{scrapeError}</span>
          <button onClick={() => setScrapeError(null)} className="ml-4 font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Edit Source Panel */}
      {editingSourceId &&
        ((): React.ReactElement | null => {
          const src = sources.find((s) => s.id === editingSourceId);
          if (!src) return null;
          return (
            <EditSourcePanel
              source={{
                id: src.id,
                name: src.name,
                url: src.url,
                examId: src.examId ?? "",
                sourceType: src.sourceType ?? "question_bank",
                scrapeFrequency: src.scrapeFrequency ?? "manual",
                scrapeDepth: src.scrapeDepth ?? 1,
                aiProvider: src.aiProvider ?? "auto",
                notes: src.notes ?? "",
              }}
              exams={examsQuery.data ?? []}
              onSave={handleEditSave}
              onCancel={() => setEditingSourceId(null)}
              isSaving={updateMutation.isPending}
            />
          );
        })()}

      {/* Filter Tabs */}
      <div className="flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "secondary" : "ghost"}
            size="sm"
            className="capitalize"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Sources Table */}
      {sourcesQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="text-muted-foreground/50 mb-4 size-12" />
            <h3 className="text-lg font-medium">No scrape sources</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Add a website source to start extracting exam questions.
            </p>
            <Link href={"/scraper/add" as "/"}>
              <Button className="mt-4 gap-2">
                <Plus className="size-4" />
                Add Your First Source
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Scraped</TableHead>
                <TableHead className="text-right">Questions</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((src) => {
                const successRate =
                  src.totalRuns && src.totalRuns > 0
                    ? Math.round(((src.successfulRuns ?? 0) / src.totalRuns) * 100)
                    : 0;
                return (
                  <TableRow
                    key={src.id}
                    className={editingSourceId === src.id ? "bg-primary/5" : ""}
                  >
                    <TableCell>
                      <div className="font-medium">{src.name}</div>
                      <div className="text-muted-foreground max-w-[200px] truncate font-mono text-xs">
                        {src.url.replace("https://", "")}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {src.examName ?? <span className="text-red-500">No exam</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {(src.sourceType ?? "question_bank").replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${STATUS_COLOR[src.status] ?? "bg-gray-400"} ${src.status === "active" ? "animate-pulse" : ""}`}
                        />
                        <span className="text-sm capitalize">{src.status}</span>
                      </div>
                      {src.lastError && src.status === "error" && (
                        <p
                          className="mt-0.5 max-w-[120px] truncate text-xs text-red-500"
                          title={src.lastError}
                        >
                          {src.lastError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(src.lastScrapedAt)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {(src.totalQuestionsScraped ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-mono font-medium ${successRate >= 90 ? "text-green-600" : successRate >= 70 ? "text-yellow-600" : "text-red-600"}`}
                      >
                        {src.totalRuns && src.totalRuns > 0 ? `${successRate}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => startScrapeMutation.mutate({ id: src.id })}
                          disabled={src.status === "active" || startScrapeMutation.isPending}
                        >
                          {startScrapeMutation.isPending &&
                          startScrapeMutation.variables?.id === src.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Play className="size-3" />
                          )}
                          Scrape
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => pauseMutation.mutate({ id: src.id })}
                          disabled={pauseMutation.isPending}
                        >
                          <Pause className="size-3" />
                          {src.status === "paused" ? "Resume" : "Pause"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7">
                              <MoreVertical className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => handleEditClick(src)}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => setHistorySourceId(src.id)}
                            >
                              <History className="size-3.5" />
                              View History
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive gap-2"
                              onClick={() => deleteMutation.mutate({ id: src.id })}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Live Scrape Log */}
      {runsQuery.data && runsQuery.data.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <span className="size-2 animate-pulse rounded-full bg-green-500" />
              <Activity className="size-4" />
              Live Scrape Log
            </div>
            <div className="bg-muted/30 max-h-48 overflow-y-auto rounded-lg border p-3 font-mono text-xs">
              {runsQuery.data.map((run) => (
                <div key={run.id} className="mb-1">
                  <span className="text-muted-foreground">
                    [{new Date(run.startedAt).toLocaleTimeString()}]
                  </span>{" "}
                  <span className="text-primary">{run.sourceId.slice(0, 8)}</span>{" "}
                  <span
                    className={
                      run.status === "completed"
                        ? "text-green-600"
                        : run.status === "failed"
                          ? "text-red-600"
                          : "text-muted-foreground"
                    }
                  >
                    {run.status} — {run.questionsNew ?? 0} new, {run.questionsDuplicate ?? 0} dupes,{" "}
                    {run.pagesFailed ?? 0} errors
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run History Dialog */}
      {historySourceId && (
        <RunHistoryDialog
          sourceId={historySourceId}
          sourceName={sources.find((s) => s.id === historySourceId)?.name ?? "Source"}
          open={!!historySourceId}
          onOpenChange={(open) => {
            if (!open) setHistorySourceId(null);
          }}
        />
      )}
    </div>
  );
}
