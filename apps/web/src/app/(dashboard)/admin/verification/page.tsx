"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type StatusFilter =
  | "all"
  | "unverified"
  | "needs_review"
  | "auto_approved"
  | "admin_approved"
  | "rejected";

type SourceFilter =
  | "all"
  | "real_paper"
  | "textbook"
  | "pattern_ai"
  | "topic_ai"
  | "supplementary_ai";

const PAGE_SIZE = 50;

export default function AdminVerificationPage(): React.ReactElement {
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("needs_review");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summaryQuery = trpc.questionVerification.getSummary.useQuery(undefined, {
    staleTime: 30_000,
  });

  const queueQuery = trpc.questionVerification.listQueue.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      sourceType: sourceFilter === "all" ? undefined : sourceFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { staleTime: 15_000 },
  );

  const bulkRevalidateMutation = trpc.questionVerification.bulkRevalidate.useMutation({
    onSuccess: (d) => {
      toast.success(`Queued ${d.queued} revalidation job${d.queued === 1 ? "" : "s"}`);
      utils.questionVerification.getSummary.invalidate();
      utils.questionVerification.listQueue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rows = queueQuery.data?.rows ?? [];
  const total = queueQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="size-6" />
            Question Verification
          </h1>
          <p className="text-muted-foreground text-sm">
            6-layer pipeline verdicts. Review the flagged queue, approve / edit / reject, or
            revalidate after prompt changes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            bulkRevalidateMutation.mutate({
              status: "needs_review",
              limit: 100,
            })
          }
          disabled={bulkRevalidateMutation.isPending}
        >
          <RefreshCw
            className={`size-4 ${bulkRevalidateMutation.isPending ? "animate-spin" : ""}`}
          />
          Revalidate needs-review (100)
        </Button>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {summaryQuery.isLoading ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </>
        ) : (
          <>
            <StatChip
              label="Auto-approved"
              value={summaryQuery.data?.auto_approved ?? 0}
              tone="ok"
              onClick={() => {
                setStatusFilter("auto_approved");
                setPage(0);
              }}
              active={statusFilter === "auto_approved"}
            />
            <StatChip
              label="Needs review"
              value={summaryQuery.data?.needs_review ?? 0}
              tone="warn"
              onClick={() => {
                setStatusFilter("needs_review");
                setPage(0);
              }}
              active={statusFilter === "needs_review"}
            />
            <StatChip
              label="Admin approved"
              value={summaryQuery.data?.admin_approved ?? 0}
              tone="ok"
              onClick={() => {
                setStatusFilter("admin_approved");
                setPage(0);
              }}
              active={statusFilter === "admin_approved"}
            />
            <StatChip
              label="Rejected"
              value={summaryQuery.data?.rejected ?? 0}
              tone="bad"
              onClick={() => {
                setStatusFilter("rejected");
                setPage(0);
              }}
              active={statusFilter === "rejected"}
            />
            <StatChip
              label="Unverified"
              value={summaryQuery.data?.unverified ?? 0}
              tone="neutral"
              onClick={() => {
                setStatusFilter("unverified");
                setPage(0);
              }}
              active={statusFilter === "unverified"}
            />
          </>
        )}
      </div>

      {/* Queue table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Queue</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="auto_approved">Auto-approved</SelectItem>
                <SelectItem value="admin_approved">Admin approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>

            <Label className="ml-2 text-xs">Source</Label>
            <Select
              value={sourceFilter}
              onValueChange={(v) => {
                setSourceFilter(v as SourceFilter);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="real_paper">Real paper</SelectItem>
                <SelectItem value="textbook">Textbook</SelectItem>
                <SelectItem value="pattern_ai">Pattern AI</SelectItem>
                <SelectItem value="topic_ai">Topic AI</SelectItem>
                <SelectItem value="supplementary_ai">Supplementary AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {queueQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No questions match this filter.
            </p>
          ) : (
            <>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead className="w-32">Source</TableHead>
                    <TableHead className="w-28">Score</TableHead>
                    <TableHead className="w-44">Layer scores</TableHead>
                    <TableHead className="w-20 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <QueueRow key={r.id} row={r} onOpen={() => setSelectedId(r.id)} />
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs">
                  <span className="text-muted-foreground">
                    Page {page + 1} of {totalPages} · {total} item
                    {total === 1 ? "" : "s"}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <QuestionDetailDrawer
          questionId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            utils.questionVerification.getSummary.invalidate();
            utils.questionVerification.listQueue.invalidate();
          }}
        />
      )}
    </div>
  );
}

// ─── Stat chip ───────────────────────────────────────────

function StatChip({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "bad" | "neutral";
  onClick?: () => void;
  active?: boolean;
}): React.ReactElement {
  const ring =
    tone === "ok"
      ? "border-green-500/40"
      : tone === "warn"
        ? "border-amber-500/50"
        : tone === "bad"
          ? "border-red-500/40"
          : "border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-card rounded-md border p-3 text-left transition-colors ${ring} ${
        active ? "ring-primary ring-2" : "hover:bg-muted/40"
      }`}
    >
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold leading-tight">{value.toLocaleString()}</p>
    </button>
  );
}

// ─── Queue row ───────────────────────────────────────────

type QueueRowData = {
  id: string;
  examName: string | null;
  content: unknown;
  subject: string;
  analyzedSubject: string | null;
  analyzedStyle: string | null;
  difficulty: string;
  sourceType: string | null;
  paperYear: number | null;
  verificationStatus: string | null;
  verificationScore: number | null;
  factualConfidence: number | null;
  syllabusAlignmentScore: number | null;
  patternMatchScore: number | null;
  verificationDetails: unknown;
};

function QueueRow({ row, onOpen }: { row: QueueRowData; onOpen: () => void }): React.ReactElement {
  const content = (row.content ?? {}) as { question?: string };
  const score = row.verificationScore ?? 0;
  const status = row.verificationStatus ?? "unverified";
  const statusVariant = STATUS_VARIANT[status] ?? "outline";
  const scorePercent = Math.round(score * 100);

  // One-line "why flagged" summary pulled from verificationDetails.
  const details = (row.verificationDetails as { factualDetails?: { issues?: string[] } }) ?? {};
  const firstIssue = details.factualDetails?.issues?.[0];

  return (
    <TableRow className="hover:bg-muted/40 cursor-pointer" onClick={onOpen}>
      <TableCell className="whitespace-normal break-words py-2 align-top">
        <p className="text-xs font-medium leading-snug">
          {content.question?.slice(0, 180) ?? "(no text)"}
          {content.question && content.question.length > 180 ? "…" : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          <Badge variant="outline" className="text-[9px]">
            {row.analyzedSubject ?? row.subject}
          </Badge>
          {row.analyzedStyle && (
            <Badge variant="outline" className="text-[9px] capitalize">
              {row.analyzedStyle.replace(/_/g, " ")}
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px] capitalize">
            {row.difficulty}
          </Badge>
          {row.examName && <span className="text-muted-foreground truncate">{row.examName}</span>}
        </div>
        {firstIssue && (
          <p className="text-muted-foreground mt-1 text-[10px] italic">⚠ {firstIssue}</p>
        )}
      </TableCell>
      <TableCell className="py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs capitalize">{row.sourceType?.replace(/_/g, " ") ?? "—"}</span>
          {row.paperYear && (
            <span className="text-muted-foreground text-[10px]">{row.paperYear}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2 align-top">
        <Badge variant={statusVariant} className="text-[9px] capitalize">
          {status.replace(/_/g, " ")}
        </Badge>
        <p className="mt-1 font-mono text-xs">
          {row.verificationScore !== null ? score.toFixed(2) : "—"}
        </p>
      </TableCell>
      <TableCell className="py-2 align-top">
        <LayerScoresBar
          source={sourceScoreFromDetails(row.verificationDetails)}
          factual={row.factualConfidence ?? null}
          syllabus={row.syllabusAlignmentScore ?? null}
          pattern={row.patternMatchScore ?? null}
        />
        <p className="text-muted-foreground mt-0.5 text-[9px]">Composite: {scorePercent}%</p>
      </TableCell>
      <TableCell className="py-2 text-right align-top">
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  auto_approved: "default",
  admin_approved: "default",
  needs_review: "secondary",
  rejected: "destructive",
  unverified: "outline",
};

function sourceScoreFromDetails(d: unknown): number | null {
  const val = (d as { sourceTrust?: number } | null)?.sourceTrust;
  return typeof val === "number" ? val : null;
}

function LayerScoresBar({
  source,
  factual,
  syllabus,
  pattern,
}: {
  source: number | null;
  factual: number | null;
  syllabus: number | null;
  pattern: number | null;
}): React.ReactElement {
  const layers = [
    { label: "Src", score: source },
    { label: "Fact", score: factual },
    { label: "Syl", score: syllabus },
    { label: "Pat", score: pattern },
  ];
  return (
    <div className="flex items-center gap-1">
      {layers.map((l) => (
        <div key={l.label} className="flex flex-1 flex-col">
          <span className="text-muted-foreground text-[8px] uppercase">{l.label}</span>
          <div className="bg-muted h-1 rounded">
            <div
              className={`h-full rounded ${scoreBgClass(l.score)}`}
              style={{
                width: l.score !== null ? `${Math.round(l.score * 100)}%` : "0%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function scoreBgClass(s: number | null): string {
  if (s === null) return "bg-muted";
  if (s >= 0.8) return "bg-green-500";
  if (s >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Detail drawer ───────────────────────────────────────

function QuestionDetailDrawer({
  questionId,
  onClose,
  onChanged,
}: {
  questionId: string;
  onClose: () => void;
  onChanged: () => void;
}): React.ReactElement {
  const detailQuery = trpc.questionVerification.getDetail.useQuery(
    { questionId },
    { staleTime: 10_000 },
  );

  const [notes, setNotes] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState("");
  const [editedOptions, setEditedOptions] = useState<string[]>([]);
  const [editedAnswer, setEditedAnswer] = useState<number>(0);
  const [editedExplanation, setEditedExplanation] = useState("");

  // Prime edit buffers when detail loads
  useMemo(() => {
    const q = detailQuery.data?.question;
    if (q && !editMode) {
      const c = (q.content ?? {}) as {
        question?: string;
        options?: string[];
        answer?: number;
        explanation?: string;
      };
      setEditedQuestion(c.question ?? "");
      setEditedOptions(c.options ?? ["", "", "", ""]);
      setEditedAnswer(c.answer ?? 0);
      setEditedExplanation(c.explanation ?? "");
    }
  }, [detailQuery.data, editMode]);

  const reviewMutation = trpc.questionVerification.review.useMutation({
    onSuccess: () => {
      toast.success("Updated");
      onChanged();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const revalidateMutation = trpc.questionVerification.revalidate.useMutation({
    onSuccess: () => {
      toast.success("Queued revalidation");
      onChanged();
    },
    onError: (err) => toast.error(err.message),
  });

  const q = detailQuery.data?.question;
  const content = (q?.content ?? {}) as {
    question?: string;
    options?: string[];
    answer?: number;
    explanation?: string;
  };
  const details = (q?.verificationDetails ?? {}) as Record<string, unknown>;
  const factualDetails = (details.factualDetails ?? {}) as {
    quality?: string;
    issues?: string[];
    suggestedFix?: string | null;
    referenceSource?: string | null;
    correctAnswer?: string | null;
    verifierExplanation?: string | null;
  };
  const syllabusDetails = (details.syllabusDetails ?? {}) as {
    inSyllabus?: boolean;
    mappedUnit?: string;
    mappedTopic?: string;
    reasoning?: string;
    difficultyAppropriateness?: string;
  };
  const duplicateDetails = (details.duplicateDetails ?? {}) as {
    tag?: string;
    similarity?: number;
    mostSimilarQuestionId?: string | null;
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Review Question</SheetTitle>
        </SheetHeader>

        {detailQuery.isLoading || !q ? (
          <div className="space-y-3 pt-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-5 pt-4">
            {/* Question content */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="text-sm">Question</CardTitle>
                <Button
                  size="sm"
                  variant={editMode ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? "Cancel edit" : "Edit"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {editMode ? (
                  <>
                    <Textarea
                      value={editedQuestion}
                      onChange={(e) => setEditedQuestion(e.target.value)}
                      rows={3}
                    />
                    {editedOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 text-xs">{String.fromCharCode(65 + i)}</span>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...editedOptions];
                            next[i] = e.target.value;
                            setEditedOptions(next);
                          }}
                          className="h-8"
                        />
                        <input
                          type="radio"
                          name="answer"
                          checked={editedAnswer === i}
                          onChange={() => setEditedAnswer(i)}
                        />
                      </div>
                    ))}
                    <Textarea
                      placeholder="Explanation"
                      value={editedExplanation}
                      onChange={(e) => setEditedExplanation(e.target.value)}
                      rows={2}
                    />
                  </>
                ) : (
                  <>
                    <p className="font-medium leading-snug">{content.question}</p>
                    <ol className="list-none space-y-1 text-sm">
                      {(content.options ?? []).map((opt, i) => (
                        <li
                          key={i}
                          className={`flex items-start gap-2 ${
                            content.answer === i ? "font-semibold" : ""
                          }`}
                        >
                          <span className="w-5">{String.fromCharCode(65 + i)})</span>
                          <span className="flex-1">{opt}</span>
                          {content.answer === i && (
                            <CheckCircle2 className="size-4 text-green-600" />
                          )}
                        </li>
                      ))}
                    </ol>
                    {content.explanation && (
                      <p className="text-muted-foreground border-t pt-2 text-xs">
                        <span className="font-medium">Explanation:</span> {content.explanation}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Source + pattern info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Source &amp; Classification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <Row k="Source type" v={q.sourceType?.replace(/_/g, " ") ?? "—"} />
                <Row k="Answer source" v={q.answerSource ?? "—"} />
                <Row k="Original exam" v={q.originalExam ?? q.source ?? "—"} />
                {q.paperYear && <Row k="Paper year" v={String(q.paperYear)} />}
                <Row k="Analyzed subject" v={q.analyzedSubject ?? "—"} />
                <Row k="Analyzed topic" v={q.analyzedTopic ?? "—"} />
                <Row k="Analyzed style" v={q.analyzedStyle ?? "—"} />
                <Row k="Difficulty" v={q.difficulty} />
              </CardContent>
            </Card>

            {/* Verification scores */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Verification scores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <ScoreRow label="Source trust" score={sourceScoreFromDetails(details)} />
                <ScoreRow label="Factual" score={q.factualConfidence ?? null} />
                <ScoreRow label="Syllabus" score={q.syllabusAlignmentScore ?? null} />
                <ScoreRow label="Pattern" score={q.patternMatchScore ?? null} />
                <div className="flex items-center gap-2 border-t pt-2">
                  <span className="w-28 text-xs font-semibold">Composite</span>
                  <Progress
                    value={Math.round((q.verificationScore ?? 0) * 100)}
                    className="h-2 flex-1"
                  />
                  <span className="font-mono text-xs">
                    {q.verificationScore?.toFixed(2) ?? "—"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Factual issues */}
            {factualDetails.issues && factualDetails.issues.length > 0 && (
              <Card className="border-amber-500/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Factual issues</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <p className="text-muted-foreground">
                    Quality: <span className="font-medium">{factualDetails.quality ?? "—"}</span>
                  </p>
                  {factualDetails.correctAnswer && (
                    <p>
                      Verifier&apos;s answer:{" "}
                      <span className="font-mono">{factualDetails.correctAnswer}</span>
                    </p>
                  )}
                  <ul className="list-disc space-y-1 pl-5">
                    {factualDetails.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                  {factualDetails.suggestedFix && (
                    <p className="text-muted-foreground mt-2 border-t pt-2">
                      <span className="font-medium">Suggested fix:</span>{" "}
                      {factualDetails.suggestedFix}
                    </p>
                  )}
                  {factualDetails.referenceSource && (
                    <p className="text-muted-foreground text-[10px]">
                      Cited: {factualDetails.referenceSource}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Syllabus mapping */}
            {syllabusDetails.inSyllabus !== undefined && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Syllabus alignment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <Row k="In syllabus" v={syllabusDetails.inSyllabus ? "Yes" : "No"} />
                  <Row k="Mapped unit" v={syllabusDetails.mappedUnit ?? "—"} />
                  <Row
                    k="Mapped topic"
                    v={
                      detailQuery.data?.mappedSyllabusNodeTitle ??
                      syllabusDetails.mappedTopic ??
                      "—"
                    }
                  />
                  <Row
                    k="Difficulty fit"
                    v={syllabusDetails.difficultyAppropriateness?.replace(/_/g, " ") ?? "—"}
                  />
                  {syllabusDetails.reasoning && (
                    <p className="text-muted-foreground mt-2 text-[11px] italic">
                      {syllabusDetails.reasoning}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Duplicate detail */}
            {duplicateDetails.tag && duplicateDetails.tag !== "unique" && (
              <Card className="border-red-500/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Duplicate detection</CardTitle>
                </CardHeader>
                <CardContent className="text-xs">
                  <p>
                    <span className="font-medium capitalize">
                      {duplicateDetails.tag.replace(/_/g, " ")}
                    </span>{" "}
                    — similarity{" "}
                    <span className="font-mono">
                      {(duplicateDetails.similarity ?? 0).toFixed(3)}
                    </span>
                  </p>
                  {duplicateDetails.mostSimilarQuestionId && (
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      Most similar: {duplicateDetails.mostSimilarQuestionId}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Audit trail */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Audit trail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {detailQuery.data?.auditTrail.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-2 border-b pb-1 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] capitalize">
                        {row.layer}
                      </Badge>
                      <span
                        className={`text-[10px] capitalize ${
                          row.result === "pass"
                            ? "text-green-600"
                            : row.result === "fail"
                              ? "text-red-600"
                              : row.result === "flag"
                                ? "text-amber-600"
                                : "text-muted-foreground"
                        }`}
                      >
                        {row.result}
                      </span>
                      {row.score !== null && (
                        <span className="font-mono text-[10px]">{row.score.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
                      {row.aiProvider && <span>{row.aiProvider}</span>}
                      {row.aiTokensUsed && row.aiTokensUsed > 0 && (
                        <span>· {row.aiTokensUsed} tok</span>
                      )}
                      {row.reviewerName && <span>· {row.reviewerName}</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Notes + actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Review notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    className="gap-1"
                    onClick={() =>
                      reviewMutation.mutate({
                        questionId: q.id,
                        decision: "approve",
                        notes: notes || undefined,
                        edits: editMode
                          ? {
                              question: editedQuestion,
                              options: editedOptions,
                              answer: editedAnswer,
                              explanation: editedExplanation,
                            }
                          : undefined,
                      })
                    }
                    disabled={reviewMutation.isPending}
                  >
                    <CheckCircle2 className="size-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="gap-1"
                    onClick={() =>
                      reviewMutation.mutate({
                        questionId: q.id,
                        decision: "reject",
                        notes: notes || undefined,
                      })
                    }
                    disabled={reviewMutation.isPending}
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1"
                    onClick={() => revalidateMutation.mutate({ questionId: q.id, force: true })}
                    disabled={revalidateMutation.isPending}
                  >
                    <RefreshCw
                      className={`size-4 ${revalidateMutation.isPending ? "animate-spin" : ""}`}
                    />
                    Revalidate
                  </Button>
                  <a
                    href={`/trpc/question.getById?input=${encodeURIComponent(
                      JSON.stringify({ id: q.id }),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" className="gap-1">
                      <ExternalLink className="size-4" />
                      Raw
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{k}</span>
      <span className="flex-1">{v}</span>
    </div>
  );
}

function ScoreRow({ label, score }: { label: string; score: number | null }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-xs">{label}</span>
      <Progress value={score !== null ? Math.round(score * 100) : 0} className="h-1.5 flex-1" />
      <span className="text-muted-foreground w-10 text-right font-mono text-xs">
        {score !== null ? score.toFixed(2) : "—"}
      </span>
    </div>
  );
}
