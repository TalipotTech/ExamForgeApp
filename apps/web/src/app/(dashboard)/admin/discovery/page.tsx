"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  AlertTriangle,
  BarChart3,
  Globe2,
  History,
  RefreshCw,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

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
  const inventoryQuery = trpc.exam.getExamInventory.useQuery(
    { sortBy: "completeness", limit: 100 },
    { staleTime: 60_000 },
  );
  const runsQuery = trpc.exam.getDiscoveryRuns.useQuery({ limit: 10 }, { staleTime: 30_000 });

  const [inventorySearch, setInventorySearch] = useState("");

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

  const deepDiscoverMutation = trpc.exam.runDeepDiscovery.useMutation({
    onSuccess: () => {
      toast.success("Queued deep discovery — papers will arrive as jobs complete");
    },
    onError: (err) => toast.error(err.message),
  });

  const validateMutation = trpc.exam.validateExam.useMutation({
    onSuccess: () => {
      toast.success("Queued completeness recompute");
      utils.exam.getExamInventory.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredInventory = (inventoryQuery.data ?? []).filter((e) =>
    e.name.toLowerCase().includes(inventorySearch.toLowerCase()),
  );

  // Missing-content alerts: exams with <3 papers OR no syllabus.
  const alerts = (inventoryQuery.data ?? [])
    .filter((e) => e.previousPapersFound < 3 || !e.syllabusFound || e.missingPaperYears.length > 0)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="size-6" />
            Content Acquisition
          </h1>
          <p className="text-muted-foreground">
            Universal Discovery v2 — monitor portals, track content completeness per exam, trigger
            deep crawls.
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

      {/* Missing Content Alerts */}
      {alerts.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600" />
              Content gaps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-2 rounded-md border border-amber-500/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{e.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {e.previousPapersFound < 3 &&
                      `${e.previousPapersFound} papers (need 3+ for pattern analysis). `}
                    {!e.syllabusFound && "Syllabus missing. "}
                    {e.missingPaperYears.length > 0 &&
                      `Missing years: ${e.missingPaperYears.slice(0, 5).join(", ")}${
                        e.missingPaperYears.length > 5 ? "..." : ""
                      }`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      deepDiscoverMutation.mutate({
                        examId: e.id,
                        skipRecent: true,
                      })
                    }
                    disabled={deepDiscoverMutation.isPending}
                  >
                    <Sparkles className="size-3.5" />
                    Deep Search
                  </Button>
                  <Link
                    href={
                      `/dashboard/find?q=${encodeURIComponent(
                        `${e.name} previous year question papers`,
                      )}` as "/"
                    }
                  >
                    <Button size="sm" variant="outline">
                      <SearchIcon className="size-3.5" />
                      Find Content
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Exam Content Inventory */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base">Exam Content Inventory</CardTitle>
          <div className="flex w-full max-w-xs items-center gap-2">
            <SearchIcon className="text-muted-foreground size-3.5" />
            <Input
              placeholder="Search exams..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {inventoryQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filteredInventory.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No exams match your search.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Body</TableHead>
                  <TableHead>Papers</TableHead>
                  <TableHead>Ans. Keys</TableHead>
                  <TableHead>Syllabus</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Completeness</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {e.conductingBody ?? "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{e.previousPapersFound}</span>
                      {e.previousPapersYears.length > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({e.previousPapersYears[0]}-
                          {e.previousPapersYears[e.previousPapersYears.length - 1]})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{e.answerKeysFound}</TableCell>
                    <TableCell>
                      {e.syllabusProcessed ? (
                        <Badge variant="default">Parsed</Badge>
                      ) : e.syllabusFound ? (
                        <Badge variant="secondary">Found</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          –
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {e.patternGenerated ? (
                        <Badge variant="default">{Math.round(e.patternConfidence * 100)}%</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          –
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="w-40">
                      <div className="flex items-center gap-2">
                        <Progress value={e.completenessScore} className="h-2 flex-1" />
                        <span className="text-muted-foreground w-9 text-right text-xs">
                          {e.completenessScore}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => validateMutation.mutate({ examId: e.id })}
                          disabled={validateMutation.isPending}
                          title="Recompute completeness"
                        >
                          <RefreshCw className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            deepDiscoverMutation.mutate({
                              examId: e.id,
                              skipRecent: true,
                            })
                          }
                          disabled={deepDiscoverMutation.isPending}
                          title="Deep discovery"
                        >
                          <Sparkles className="size-3.5" />
                        </Button>
                        <Link href={`/dashboard/exam/${e.id}/patterns` as "/"}>
                          <Button size="sm" variant="ghost" title="Patterns">
                            <BarChart3 className="size-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Activity log — recent discovery runs */}
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
                <div
                  key={r.id}
                  className="flex items-center justify-between border-b pb-2 last:border-b-0"
                >
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
                    <span>
                      {r.examsFound} exams found · {r.examsNew ?? 0} new
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {(r.portalsChecked as string[] | null)?.length ?? 0} portal(s)
                  </span>
                </div>
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
