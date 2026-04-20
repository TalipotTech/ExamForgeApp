"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, FlaskConical, Search as SearchIcon, ShieldCheck, Sparkles, X } from "lucide-react";
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

const DEFAULT_COUNT = 10;

// Shape returned by exam.getScrapedExaminationInventory — kept loose to
// avoid a second source of truth for this type.
type InventoryRow = {
  rowKey: string;
  examName: string;
  postName: string | null;
  categoryNumber: string | null;
  examDate: string | null;
  examTime: string | null;
  venue: string | null;
  department: string | null;
  stage: string | null;
  status: string | null;
  documentId: string;
  portalName: string | null;
  examCategory: string | null;
  hasSyllabus: boolean;
  canonicalExamId: string | null;
  canonicalName: string | null;
  matchedBy: "exact" | "normalized" | "alias" | "token" | "none";
  matchConfidence: number;
  hasPattern: boolean;
  patternConfidence: number | null;
  patternPapers: number;
  patternVersion: number | null;
};

export default function AdminGenerationPage(): React.ReactElement {
  // Source of truth = the same scraped examinations the public /exams
  // page renders. Each row carries its canonical exam id when matched,
  // which is what topic-seeded generation keys off.
  const inventoryQuery = trpc.exam.getScrapedExaminationInventory.useQuery(undefined, {
    staleTime: 60_000,
  });

  const [examId, setExamId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<ExaminationTimeFilter>("all");
  const [counts, setCounts] = useState<Record<number, number>>({});

  const rows = (inventoryQuery.data ?? []) as InventoryRow[];

  const filteredExams = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (!matchesTimeFilter(timeFilter, daysUntil(r.examDate))) return false;
      if (!term) return true;
      return (
        r.examName.toLowerCase().includes(term) ||
        r.postName?.toLowerCase().includes(term) ||
        r.canonicalName?.toLowerCase().includes(term) ||
        r.categoryNumber?.toLowerCase().includes(term)
      );
    });
    return [...matched].sort((a, b) => compareByExamDate(a.examDate, b.examDate));
  }, [rows, search, timeFilter]);

  const examStats = useMemo(() => {
    const total = rows.length;
    const matched = rows.filter((r) => r.canonicalExamId).length;
    const withSyllabus = rows.filter((r) => r.hasSyllabus).length;
    const upcoming = rows.filter((r) => {
      const d = daysUntil(r.examDate);
      return d !== null && d > 0;
    }).length;
    const completed = rows.filter((r) => {
      const d = daysUntil(r.examDate);
      return d !== null && d <= 0;
    }).length;
    return { total, matched, withSyllabus, upcoming, completed };
  }, [rows]);

  // ─── Syllabus nodes for the currently selected canonical exam ───
  const nodesQuery = trpc.topicGeneration.listNodesForExam.useQuery(
    { examId: examId! },
    { enabled: Boolean(examId), staleTime: 30_000 },
  );

  const utils = trpc.useUtils();
  const generateMutation = trpc.topicGeneration.generate.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`Queued generation for node ${vars.syllabusNodeId}`);
      void utils.topicGeneration.listNodesForExam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredTopics = useMemo(() => {
    const nodes = nodesQuery.data?.nodes ?? [];
    const term = search.trim().toLowerCase();
    if (!term || !examId) return nodes;
    return nodes.filter(
      (n) =>
        n.title.toLowerCase().includes(term) ||
        n.parentTitle?.toLowerCase().includes(term) ||
        n.description?.toLowerCase().includes(term),
    );
  }, [nodesQuery.data, search, examId]);

  const totals = useMemo(() => {
    const nodes = nodesQuery.data?.nodes ?? [];
    return {
      nodes: nodes.length,
      generatableNodes: nodes.filter((n) => n.canGenerate).length,
      totalSeeds: nodes.reduce((a, n) => a + n.seedCount, 0),
      totalAi: nodes.reduce((a, n) => a + n.topicAiCount, 0),
    };
  }, [nodesQuery.data]);

  const handlePickExam = (row: InventoryRow): void => {
    if (!row.canonicalExamId) {
      toast.error(
        "This examination isn't linked to a canonical exam yet. Link it first from the Pattern Analysis page.",
      );
      return;
    }
    if (!row.hasSyllabus) {
      toast.error(
        `"${row.canonicalName ?? row.examName}" has no syllabus uploaded. Upload one from the Syllabus page before generating questions.`,
      );
      return;
    }
    setExamId(row.canonicalExamId);
    setSelectedName(row.canonicalName ?? row.examName);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FlaskConical className="size-6" />
          Topic-Seeded Generation
        </h1>
        <p className="text-muted-foreground text-sm">
          Generate new questions for a syllabus topic, using real question papers (or textbook MCQs)
          already mapped to that topic as style/difficulty seeds. Examinations are sourced from the
          scraped portal calendar (same as{" "}
          <Link href={"/exams" as "/"} className="underline">
            /exams
          </Link>
          ). Output runs through the 6-layer verification pipeline automatically.{" "}
          <Link href={"/admin/verification" as "/"} className="underline">
            Review generated questions →
          </Link>
        </p>
      </div>

      {/* Exam inventory stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Examinations" value={examStats.total} />
        <StatChip label="Linked to canonical" value={examStats.matched} tone="ok" />
        <StatChip label="With syllabus" value={examStats.withSyllabus} tone="ok" />
        <StatChip label="Upcoming" value={examStats.upcoming} />
      </div>

      {/* Currently-selected banner */}
      {examId && selectedName && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <Check className="text-primary size-4" />
            <div className="flex-1 text-sm">
              Generating for <span className="font-semibold">{selectedName}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setExamId(null);
                setSelectedName(null);
              }}
            >
              <X className="size-3.5" />
              Change
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Examination picker — only shown when nothing is selected */}
      {!examId && (
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-3">
            <div className="flex flex-row items-start justify-between gap-3">
              <CardTitle className="text-base">Pick an examination</CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex w-64 items-center gap-2">
                  <SearchIcon className="text-muted-foreground size-3.5" />
                  <Input
                    placeholder="Search examinations..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
            <TimeFilterTabs
              value={timeFilter}
              onChange={setTimeFilter}
              counts={{
                all: examStats.total,
                upcoming: examStats.upcoming,
                completed: examStats.completed,
              }}
            />
          </CardHeader>
          <CardContent>
            {inventoryQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filteredExams.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {rows.length === 0
                  ? "No examinations yet. Ingest an examination-schedule PDF via the scraper to populate this."
                  : "No examinations match the current filter."}
              </p>
            ) : (
              <>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Examination</TableHead>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-36">Canonical Match</TableHead>
                      <TableHead className="w-24">Syllabus</TableHead>
                      <TableHead className="w-28 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExams.slice(0, 150).map((r, idx) => {
                      const days = daysUntil(r.examDate);
                      const isCompleted = days !== null && days <= 0;
                      const canPick = Boolean(r.canonicalExamId && r.hasSyllabus);
                      return (
                        <TableRow
                          key={`${r.rowKey}-${idx}`}
                          className={isCompleted ? "opacity-60" : ""}
                        >
                          <TableCell className="whitespace-normal break-words py-2 align-top">
                            <ExaminationTitle exam={r} />
                            <div className="mt-1.5">
                              <ExaminationMeta exam={r} compact />
                            </div>
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <ExaminationDate dateStr={r.examDate} />
                          </TableCell>
                          <TableCell className="whitespace-normal py-2 align-top">
                            {r.canonicalExamId ? (
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className="break-words text-[11px] font-medium leading-snug"
                                  title={r.canonicalName ?? undefined}
                                >
                                  {r.canonicalName}
                                </span>
                                <Badge variant="outline" className="w-fit text-[9px] font-normal">
                                  {r.matchedBy} · {Math.round(r.matchConfidence * 100)}%
                                </Badge>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground text-[10px]"
                              >
                                Not linked
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            {r.hasSyllabus ? (
                              <Badge variant="default" className="text-[10px]">
                                ✓ present
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-right align-top">
                            <Button
                              size="sm"
                              variant={canPick ? "default" : "outline"}
                              disabled={!canPick}
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => handlePickExam(r)}
                              title={
                                canPick
                                  ? "Use this examination for generation"
                                  : !r.canonicalExamId
                                    ? "Link to a canonical exam first (from Pattern Analysis)"
                                    : "Upload a syllabus first (from Syllabus page)"
                              }
                            >
                              <Sparkles className="size-3.5" />
                              Pick
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredExams.length > 150 && (
                  <p className="text-muted-foreground mt-2 text-center text-xs">
                    Showing 150 of {filteredExams.length} — refine the search to narrow down.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary chips for the selected exam */}
      {examId && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="Syllabus nodes" value={totals.nodes} />
          <StatChip label="Generatable" value={totals.generatableNodes} tone="ok" />
          <StatChip label="Real + textbook seeds" value={totals.totalSeeds} tone="ok" />
          <StatChip label="Topic-AI generated" value={totals.totalAi} tone="neutral" />
        </div>
      )}

      {/* Syllabus nodes table */}
      {examId && (
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Syllabus topics</CardTitle>
            <div className="flex w-64 items-center gap-2">
              <SearchIcon className="text-muted-foreground size-3.5" />
              <Input
                placeholder="Search topics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {nodesQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filteredTopics.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {nodesQuery.data?.nodes?.length === 0
                  ? "No syllabus nodes for this exam yet. Upload and parse a syllabus first."
                  : "No topics match your search."}
              </p>
            ) : (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead className="w-20 text-right">Seeds</TableHead>
                    <TableHead className="w-20 text-right">AI gen</TableHead>
                    <TableHead className="w-28">Count</TableHead>
                    <TableHead className="w-32 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTopics.slice(0, 200).map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="whitespace-normal break-words py-2 align-top">
                        <div className="flex flex-col gap-0.5">
                          {n.parentTitle && (
                            <span className="text-muted-foreground text-[10px]">
                              {n.parentTitle}
                            </span>
                          )}
                          <span className="text-xs font-medium capitalize leading-snug">
                            {n.title.toLowerCase()}
                          </span>
                          {n.description && (
                            <span className="text-muted-foreground text-[11px] leading-snug">
                              {n.description.slice(0, 160)}
                              {n.description.length > 160 ? "…" : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right align-top">
                        <Badge
                          variant={n.canGenerate ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {n.seedCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right align-top">
                        <span className="text-muted-foreground text-xs">{n.topicAiCount}</span>
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={counts[n.id] ?? DEFAULT_COUNT}
                          onChange={(e) =>
                            setCounts((prev) => ({
                              ...prev,
                              [n.id]: Number(e.target.value),
                            }))
                          }
                          disabled={!n.canGenerate}
                          className="h-7 w-20 text-xs"
                        />
                      </TableCell>
                      <TableCell className="py-2 text-right align-top">
                        <Button
                          size="sm"
                          variant={n.canGenerate ? "default" : "outline"}
                          disabled={!n.canGenerate || generateMutation.isPending}
                          className="h-7 gap-1 text-xs"
                          onClick={() =>
                            generateMutation.mutate({
                              examId: examId!,
                              syllabusNodeId: n.id,
                              count: counts[n.id] ?? DEFAULT_COUNT,
                              skipCoveredAspects: true,
                            })
                          }
                          title={
                            n.canGenerate
                              ? "Queue topic-seeded generation"
                              : "Need ≥3 real/textbook seeds to generate"
                          }
                        >
                          <Sparkles className="size-3.5" />
                          Generate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {filteredTopics.length > 200 && (
              <p className="text-muted-foreground mt-2 text-center text-xs">
                Showing 200 of {filteredTopics.length} — refine the search.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Call-out for next step */}
      {examId && totals.totalAi > 0 && (
        <Card className="border-green-500/40">
          <CardContent className="flex items-center gap-3 pt-4">
            <ShieldCheck className="size-5 text-green-600" />
            <div className="flex-1 text-xs">
              Generated questions run through the verification pipeline automatically. Check their
              scores and approve in the Verification queue.
            </div>
            <Link href={"/admin/verification?status=needs_review" as "/"}>
              <Button size="sm" variant="outline" className="h-7">
                Open Verification
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "neutral";
}): React.ReactElement {
  const ring = tone === "ok" ? "border-green-500/30" : "border-border";
  return (
    <Card className={`border ${ring}`}>
      <CardContent className="p-3">
        <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
        <p className="text-xl font-semibold leading-tight">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

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
