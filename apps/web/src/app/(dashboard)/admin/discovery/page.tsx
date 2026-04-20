"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Bell,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe2,
  History,
  RefreshCw,
  Search as SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  ExaminationTitle,
  ExaminationDate,
  ExaminationMeta,
} from "@/components/exam/examination-info";
import {
  compareByExamDate,
  daysUntil,
  matchesTimeFilter,
  type ExaminationTimeFilter,
} from "@/lib/exam-display";

// Human-friendly "time ago" string (no dependencies).
function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "in the future";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function AdminDiscoveryPage(): React.ReactElement {
  const utils = trpc.useUtils();

  const portalsQuery = trpc.exam.getPortalStatus.useQuery(undefined, {
    staleTime: 60_000,
  });
  const runsQuery = trpc.exam.getDiscoveryRuns.useQuery({ limit: 10 }, { staleTime: 30_000 });

  // Scraped examinations — same source as the public /exams catalog.
  // This is the source of truth for what exams exist on the platform.
  const examinationsQuery = trpc.portalIngestion.listAllExaminations.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Source notification PDFs whose metadata contains the examination entries.
  const recentDocsQuery = trpc.exam.getRecentPortalDocuments.useQuery(
    { limit: 20 },
    { staleTime: 30_000 },
  );

  // Group scraped examinations by their source documentId so each
  // notification row can expand to reveal the examinations it contains.
  const examinationsByDocId = useMemo(() => {
    const m = new Map<string, NonNullable<typeof examinationsQuery.data>>();
    for (const e of examinationsQuery.data ?? []) {
      const list = m.get(e.documentId) ?? [];
      list.push(e);
      m.set(e.documentId, list);
    }
    return m;
  }, [examinationsQuery.data]);

  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [examinationSearch, setExaminationSearch] = useState("");
  const [examTimeFilter, setExamTimeFilter] = useState<ExaminationTimeFilter>("all");

  const runDiscoveryMutation = trpc.exam.runUniversalDiscovery.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Queued ${data.portalsQueued} broad-discovery job${data.portalsQueued === 1 ? "" : "s"}`,
      );
      utils.exam.getPortalStatus.invalidate();
      utils.exam.getDiscoveryRuns.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const checkOnePortalMutation = trpc.exam.runUniversalDiscovery.useMutation({
    onSuccess: (_data, vars) => {
      toast.success(`Queued check for ${vars?.portalIds?.[0] ?? "portal"}`);
      utils.exam.getPortalStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Filtered examinations for the main inventory ────────────
  const filteredExaminations = useMemo(() => {
    const list = examinationsQuery.data ?? [];
    const term = examinationSearch.trim().toLowerCase();
    const matched = list.filter((e) => {
      if (!matchesTimeFilter(examTimeFilter, daysUntil(e.examDate))) return false;
      if (!term) return true;
      return (
        e.examName.toLowerCase().includes(term) ||
        e.postName?.toLowerCase().includes(term) ||
        e.categoryNumber?.toLowerCase().includes(term) ||
        e.department?.toLowerCase().includes(term) ||
        e.portalName?.toLowerCase().includes(term)
      );
    });
    return [...matched].sort((a, b) => compareByExamDate(a.examDate, b.examDate));
  }, [examinationsQuery.data, examinationSearch, examTimeFilter]);

  // Filter counts (before search + time filter apply)
  const examTimeCounts = useMemo(() => {
    const list = examinationsQuery.data ?? [];
    let upcoming = 0;
    let completed = 0;
    for (const e of list) {
      const d = daysUntil(e.examDate);
      if (d !== null && d > 0) upcoming++;
      else if (d !== null && d <= 0) completed++;
    }
    return { all: list.length, upcoming, completed };
  }, [examinationsQuery.data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="size-6" />
            Content Acquisition
          </h1>
          <p className="text-muted-foreground text-sm">
            Universal Discovery v2 — monitor portals, browse scraped examinations, trigger runs.
          </p>
        </div>
        <Button
          onClick={() => runDiscoveryMutation.mutate({ maxPagesPerPortal: 3 })}
          disabled={runDiscoveryMutation.isPending}
        >
          <RefreshCw className={`size-4 ${runDiscoveryMutation.isPending ? "animate-spin" : ""}`} />
          {runDiscoveryMutation.isPending ? "Queueing..." : "Run All Daily Portals"}
        </Button>
      </div>

      {/* Portal Status Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="size-4" />
            Portal Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {portalsQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(portalsQuery.data ?? []).map((p) => (
                <PortalCard
                  key={p.id}
                  portal={p}
                  onCheck={() =>
                    checkOnePortalMutation.mutate({
                      portalIds: [p.id],
                      maxPagesPerPortal: 3,
                    })
                  }
                  isPending={
                    checkOnePortalMutation.isPending &&
                    checkOnePortalMutation.variables?.portalIds?.[0] === p.id
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Notifications — notification/source PDFs whose metadata feeds
          the Examinations table below. Each row expands to reveal the
          examinations contained in that notification. */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" />
            Exam Notifications
          </CardTitle>
          <span className="text-muted-foreground text-xs">
            Source PDFs — click a row to see contained examinations
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {recentDocsQuery.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !recentDocsQuery.data || recentDocsQuery.data.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              No notifications ingested yet.
            </p>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  {/* Title takes the remainder; every other column is
                      explicitly sized so table-fixed enforces them. */}
                  <TableHead className="w-6"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-24">Portal</TableHead>
                  <TableHead className="w-16">Year</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-16 text-right">Exams</TableHead>
                  <TableHead className="w-20">Added</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDocsQuery.data.map((d) => {
                  const contained = examinationsByDocId.get(d.id) ?? [];
                  const isExpanded = expandedDocId === d.id;
                  return (
                    <Fragment key={d.id}>
                      <TableRow
                        className="hover:bg-muted/40 cursor-pointer"
                        onClick={() => setExpandedDocId(isExpanded ? null : d.id)}
                      >
                        <TableCell className="py-2 align-top">
                          {contained.length > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell
                          className="whitespace-normal break-words py-2 align-top text-[11px] font-medium leading-snug"
                          title={d.title}
                        >
                          {d.title}
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          <Badge variant="outline" className="text-[9px] font-normal">
                            {d.documentType.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground truncate py-2 align-top text-[11px]"
                          title={d.portalName ?? undefined}
                        >
                          {d.portalName}
                        </TableCell>
                        <TableCell className="py-2 align-top text-[11px]">
                          {d.examYear ?? "—"}
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          <Badge
                            variant={
                              d.processingStatus === "processed"
                                ? "default"
                                : d.processingStatus === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-[9px] font-normal"
                          >
                            {d.processingStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-right align-top text-[11px]">
                          {contained.length > 0 ? contained.length : (d.questionsExtracted ?? 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground py-2 align-top text-[11px]">
                          {timeAgo(d.createdAt)}
                        </TableCell>
                        <TableCell className="py-2 text-right align-top">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link href={`/scraper/ingest/${d.id}` as "/"}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                title="View document"
                              >
                                <FileText className="size-3.5" />
                              </Button>
                            </Link>
                            {d.originalUrl && (
                              <a href={d.originalUrl} target="_blank" rel="noopener noreferrer">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  title="Original URL"
                                >
                                  <ExternalLink className="size-3.5" />
                                </Button>
                              </a>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && contained.length > 0 && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={9} className="whitespace-normal p-0">
                            <div className="border-primary/40 border-l-2 px-4 py-3">
                              <p className="text-muted-foreground mb-2 text-[11px] uppercase tracking-wide">
                                Contained examinations ({contained.length})
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {contained.map((ex, idx) => {
                                  const exDays = daysUntil(ex.examDate);
                                  const exCompleted = exDays !== null && exDays <= 0;
                                  return (
                                    <Link
                                      key={`${ex.id}-${idx}`}
                                      href={`/scraper/ingest/${ex.documentId}` as "/"}
                                      className={`bg-background hover:border-primary/50 flex flex-col gap-1.5 rounded-md border p-2 transition-colors ${
                                        exCompleted ? "opacity-60" : ""
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <ExaminationTitle exam={ex} />
                                        </div>
                                        <div className="shrink-0">
                                          <ExaminationDate dateStr={ex.examDate} />
                                        </div>
                                      </div>
                                      <ExaminationMeta exam={ex} compact />
                                      {ex.hasSyllabus && (
                                        <Badge
                                          variant="default"
                                          className="w-fit text-[9px] font-normal"
                                        >
                                          Syllabus available
                                        </Badge>
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>
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

      {/* Examinations — merged inventory. Source of truth is the scraped
          examination_schedule metadata (same as public /exams). */}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3">
          <div className="flex flex-row items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="size-4" />
              Examinations
            </CardTitle>
            <div className="flex w-full max-w-xs items-center gap-2">
              <SearchIcon className="text-muted-foreground size-3.5" />
              <Input
                placeholder="Search examinations..."
                value={examinationSearch}
                onChange={(e) => setExaminationSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <TimeFilterTabs
            value={examTimeFilter}
            onChange={setExamTimeFilter}
            counts={examTimeCounts}
          />
        </CardHeader>
        <CardContent>
          {examinationsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : filteredExaminations.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {examinationsQuery.data && examinationsQuery.data.length > 0
                ? "No examinations match your search."
                : "No examinations processed yet. Ingest an examination-schedule PDF via the scraper to populate this list."}
            </p>
          ) : (
            <>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    {/* Examination takes the remainder; others fixed-width */}
                    <TableHead>Examination</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-20">Syllabus</TableHead>
                    <TableHead className="w-16 text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExaminations.slice(0, 100).map((e, idx) => {
                    const days = daysUntil(e.examDate);
                    const isCompleted = days !== null && days <= 0;
                    return (
                      <TableRow key={`${e.id}-${idx}`} className={isCompleted ? "opacity-60" : ""}>
                        <TableCell className="whitespace-normal break-words py-2 align-top">
                          <ExaminationTitle exam={e} />
                          <div className="mt-1.5">
                            <ExaminationMeta exam={e} compact />
                          </div>
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          <ExaminationDate dateStr={e.examDate} />
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          {e.hasSyllabus ? (
                            <Badge variant="default" className="text-[9px] font-normal">
                              Available
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right align-top">
                          <Link href={`/scraper/ingest/${e.documentId}` as "/"}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="View source document"
                            >
                              <FileText className="size-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredExaminations.length > 100 && (
                <p className="text-muted-foreground mt-2 text-center text-xs">
                  Showing 100 of {filteredExaminations.length} — refine the search to narrow down.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Activity log — recent discovery runs, each a link to the v1
          discovery page drill-down with per-run error logs + tabs. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Recent Discovery Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !runsQuery.data || runsQuery.data.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">No discovery runs yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {runsQuery.data.map((r) => (
                <Link
                  key={r.id}
                  href={"/scraper/discovery" as "/"}
                  className="block"
                  title="View full drill-down (v1 discovery page)"
                >
                  <div className="hover:bg-muted/40 flex items-center justify-between rounded-md border-b px-2 py-2 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          r.status === "completed"
                            ? "default"
                            : r.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">{timeAgo(r.startedAt)}</span>
                      <span className="text-xs">
                        {r.examsFound} exams found · {r.examsNew ?? 0} new ·{" "}
                        {r.notificationsCreated ?? 0} notifications
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {(r.portalsChecked as string[] | null)?.length ?? 0} portal(s)
                      </span>
                      <ChevronRight className="text-muted-foreground size-3.5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Portal status card ─────────────────────────────────

type PortalRow = {
  id: string;
  name: string;
  domain: string;
  type: "conducting_body" | "exam_specific" | "aggregator";
  checkFrequency: "daily" | "weekly" | "monthly";
  priority: number;
  examsConducted: string[];
  notes?: string | null;
  lastCheckedAt: Date | string | null;
  lastRunStatus: string | null;
  lastRunExamsFound: number;
  health: "ok" | "stale" | "error" | "unknown";
};

function PortalCard({
  portal,
  onCheck,
  isPending,
}: {
  portal: PortalRow;
  onCheck: () => void;
  isPending: boolean;
}): React.ReactElement {
  const healthColor =
    portal.health === "ok"
      ? "bg-green-500"
      : portal.health === "stale"
        ? "bg-amber-500"
        : portal.health === "error"
          ? "bg-red-500"
          : "bg-muted-foreground/40";

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full ${healthColor}`}
            title={`Status: ${portal.health}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{portal.name}</p>
            <p className="text-muted-foreground truncate text-xs">{portal.domain}</p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {portal.checkFrequency}
        </Badge>
      </div>
      <div className="text-muted-foreground text-xs">
        Last checked: {timeAgo(portal.lastCheckedAt)}
        {portal.lastRunExamsFound > 0 && ` · ${portal.lastRunExamsFound} exams`}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onCheck}
        disabled={isPending}
        className="h-7 w-full"
      >
        <RefreshCw className={`size-3 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Queued..." : "Check Now"}
      </Button>
    </div>
  );
}

// ─── Time filter segmented tabs ──────────────────────────

function TimeFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: ExaminationTimeFilter;
  onChange: (v: ExaminationTimeFilter) => void;
  counts: { all: number; upcoming: number; completed: number };
}): React.ReactElement {
  const options: Array<{ key: ExaminationTimeFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "completed", label: "Completed", count: counts.completed },
  ];
  return (
    <div className="border-border inline-flex rounded-md border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            value === opt.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
          <span className={`ml-1.5 text-[10px] ${value === opt.key ? "opacity-80" : "opacity-60"}`}>
            {opt.count}
          </span>
        </button>
      ))}
    </div>
  );
}
