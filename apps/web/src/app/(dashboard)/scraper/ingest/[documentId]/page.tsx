"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  BookOpen,
  Calendar,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ExamMapper } from "@/components/exam-mapper";

// ─── Types ───

type McqContent = {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
};

type ExaminationEntry = {
  examName: string;
  postName?: string;
  categoryNumber?: string;
  examDate?: string;
  examTime?: string;
  venue?: string;
  department?: string;
  stage?: string;
  status?: string;
  remarks?: string;
  syllabusUrl?: string;
};

type ExaminationMetadata = {
  type: "examination_schedule";
  examinations: ExaminationEntry[];
  syllabusLinks?: Array<{
    url: string;
    entryKey: string;
    syllabusId: number;
    examName: string;
    status: string;
  }>;
};

type ReviewStatus = "pending" | "approved" | "rejected" | "duplicate";

// ─── Helpers ───

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
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function reviewBadge(status: string): React.ReactElement {
  const map: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
  > = {
    pending: { variant: "outline", label: "Pending" },
    approved: { variant: "default", label: "Approved" },
    rejected: { variant: "destructive", label: "Rejected" },
    duplicate: { variant: "secondary", label: "Duplicate" },
  };
  const cfg = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function examStageBadge(stage?: string): React.ReactElement | null {
  if (!stage) return null;
  const colors: Record<string, string> = {
    preliminary: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    main: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    interview: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    descriptive: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    OMR: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  };
  const cls = colors[stage.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {stage}
    </span>
  );
}

function examStatusBadge(status?: string): React.ReactElement | null {
  if (!status) return null;
  const colors: Record<string, string> = {
    scheduled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    postponed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    completed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  };
  const cls = colors[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

// ─── Examination Schedule View ───

function ExaminationScheduleView({
  metadata,
  documentId,
  examId,
}: {
  metadata: ExaminationMetadata;
  documentId: string;
  examId?: string | null;
}): React.ReactElement {
  const [parsingSyllabusFor, setParsingSyllabusFor] = useState<string | null>(null);
  const [reparsingFor, setReparsingFor] = useState<string | null>(null);
  const [viewingSyllabusId, setViewingSyllabusId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const utils = trpc.useUtils();

  const parseSyllabusMutation = trpc.portalIngestion.parseSyllabusFromUrl.useMutation({
    onSuccess: () => {
      setParsingSyllabusFor(null);
      utils.portalIngestion.getPortalDocumentById.invalidate();
    },
    onError: () => {
      setParsingSyllabusFor(null);
    },
  });

  const reparseMutation = trpc.portalIngestion.reparseSyllabus.useMutation({
    onSuccess: () => {
      setReparsingFor(null);
      utils.portalIngestion.getPortalDocumentById.invalidate();
    },
    onError: () => {
      setReparsingFor(null);
    },
  });

  const syllabusQuery = trpc.portalIngestion.getSyllabusData.useQuery(
    { syllabusId: viewingSyllabusId! },
    {
      enabled: viewingSyllabusId !== null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "processing" ? 3000 : false; // Poll every 3s while processing
      },
    },
  );

  // Poll when syllabus is processing — auto-refresh every 3s
  const isProcessing =
    syllabusQuery.data?.status === "processing" || syllabusQuery.data?.status === "uploaded";
  useEffect(() => {
    if (!isProcessing || viewingSyllabusId === null) return;
    const interval = setInterval(() => {
      syllabusQuery.refetch();
    }, 3000);
    return () => clearInterval(interval);
  }, [isProcessing, viewingSyllabusId]);

  const examinations = metadata.examinations ?? [];
  const syllabusLinks = metadata.syllabusLinks ?? [];

  // Filter examinations by search
  const filtered = searchTerm
    ? examinations.filter((e) => {
        const term = searchTerm.toLowerCase();
        return (
          e.examName.toLowerCase().includes(term) ||
          e.postName?.toLowerCase().includes(term) ||
          e.categoryNumber?.toLowerCase().includes(term) ||
          e.department?.toLowerCase().includes(term)
        );
      })
    : examinations;

  function entryKey(entry: ExaminationEntry): string {
    return `${entry.examName}::${entry.categoryNumber ?? ""}`;
  }

  function handleParseSyllabus(entry: ExaminationEntry): void {
    setParsingSyllabusFor(entryKey(entry));
    parseSyllabusMutation.mutate({
      syllabusUrl: entry.syllabusUrl || entry.examName, // Fall back to name for listing page search
      examName: entry.examName,
      categoryNumber: entry.categoryNumber,
      portalDocumentId: documentId,
      examId: examId ?? undefined,
    });
  }

  function handleReparse(entry: ExaminationEntry): void {
    const link = getSyllabusLink(entry);
    if (!link) return;
    setReparsingFor(entryKey(entry));
    reparseMutation.mutate({ syllabusId: link.syllabusId });
  }

  function getSyllabusLink(
    entry: ExaminationEntry,
  ):
    | { url: string; entryKey: string; syllabusId: number; examName: string; status: string }
    | undefined {
    const key = entryKey(entry);
    return syllabusLinks.find((s) => s.entryKey === key);
  }

  function isSyllabusParsed(entry: ExaminationEntry): boolean {
    return !!getSyllabusLink(entry);
  }

  // Build tree from flat nodes
  type SyllabusNode = {
    id: number;
    title: string;
    nodeType: string;
    depth: number;
    description: string | null;
    content: string | null;
    children: SyllabusNode[];
  };

  function buildTree(
    nodes: Array<{
      id: number;
      title: string;
      nodeType: string;
      depth: number;
      parentId: number | null;
      description: string | null;
      content: string | null;
      sortOrder: number;
    }>,
  ): SyllabusNode[] {
    const map = new Map<number, SyllabusNode>();
    const roots: SyllabusNode[] = [];

    for (const n of nodes) {
      map.set(n.id, { ...n, children: [] });
    }

    for (const n of nodes) {
      const node = map.get(n.id)!;
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  function renderNode(node: SyllabusNode, level: number = 0): React.ReactElement {
    const indent = level * 16;
    const typeColors: Record<string, string> = {
      unit: "text-blue-600 dark:text-blue-400 font-semibold",
      chapter: "text-purple-600 dark:text-purple-400 font-medium",
      topic: "text-foreground",
      subtopic: "text-muted-foreground",
      definition: "text-teal-600 dark:text-teal-400 italic",
      formula: "text-amber-600 dark:text-amber-400 font-mono",
      objective: "text-green-600 dark:text-green-400",
    };
    const cls = typeColors[node.nodeType] ?? "text-foreground";

    return (
      <div key={node.id}>
        <div className={`py-1 text-xs ${cls}`} style={{ paddingLeft: `${indent}px` }}>
          <span className="text-muted-foreground mr-1.5 text-[9px] uppercase">{node.nodeType}</span>
          {node.title}
          {node.description && (
            <span className="text-muted-foreground ml-1">— {node.description}</span>
          )}
        </div>
        {node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Examination Schedule ({examinations.length} entries)
            </span>
            <Input
              placeholder="Search exams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-[200px] text-xs"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {parseSyllabusMutation.error && (
            <div className="bg-destructive/10 text-destructive mb-3 rounded p-2 text-xs">
              {parseSyllabusMutation.error.message}
            </div>
          )}
          {reparseMutation.error && (
            <div className="bg-destructive/10 text-destructive mb-3 rounded p-2 text-xs">
              Reparse failed: {reparseMutation.error.message}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-[11px]">#</TableHead>
                  <TableHead className="min-w-[200px] text-[11px]">Exam Name</TableHead>
                  <TableHead className="text-[11px]">Post / Position</TableHead>
                  <TableHead className="text-[11px]">Cat. No.</TableHead>
                  <TableHead className="text-[11px]">Date</TableHead>
                  <TableHead className="text-[11px]">Department</TableHead>
                  <TableHead className="text-[11px]">Stage</TableHead>
                  <TableHead className="text-[11px]">Status</TableHead>
                  <TableHead className="text-[11px]">Syllabus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry, idx) => (
                  <TableRow key={idx} className="text-xs">
                    <TableCell className="text-muted-foreground text-[11px]">{idx + 1}</TableCell>
                    <TableCell
                      className="max-w-[250px] text-[11px] font-medium"
                      title={[
                        entry.examName,
                        entry.venue ? `Venue: ${entry.venue}` : "",
                        entry.examTime ? `Time: ${entry.examTime}` : "",
                        entry.remarks ? `Remarks: ${entry.remarks}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    >
                      <span className="line-clamp-2 cursor-default">{entry.examName}</span>
                    </TableCell>
                    <TableCell className="max-w-[180px] text-[11px]">
                      <span className="line-clamp-2">{entry.postName ?? "-"}</span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {entry.categoryNumber ?? "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px]">
                      {entry.examDate ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-[150px] text-[11px]">
                      <span className="line-clamp-1">{entry.department ?? "-"}</span>
                    </TableCell>
                    <TableCell>{examStageBadge(entry.stage)}</TableCell>
                    <TableCell>{examStatusBadge(entry.status)}</TableCell>
                    <TableCell>
                      {isSyllabusParsed(entry) ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 gap-0.5 px-1.5 text-[9px] text-green-700 dark:text-green-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = getSyllabusLink(entry);
                              if (link) setViewingSyllabusId(link.syllabusId);
                            }}
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 gap-0.5 px-1 text-[9px]"
                            disabled={reparsingFor === entryKey(entry)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReparse(entry);
                            }}
                            title="Re-parse syllabus"
                          >
                            {reparsingFor === entryKey(entry) ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-2.5 w-2.5" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[10px]"
                          disabled={parsingSyllabusFor === entryKey(entry)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleParseSyllabus(entry);
                          }}
                        >
                          {parsingSyllabusFor === entryKey(entry) ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <BookOpen className="h-2.5 w-2.5" />
                          )}
                          Parse
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filtered.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {searchTerm ? "No examinations matching search." : "No examination entries found."}
            </p>
          )}

          {/* Summary stats */}
          {examinations.length > 0 && (
            <div className="text-muted-foreground mt-4 flex gap-4 border-t pt-3 text-xs">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {examinations.length} total entries
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {examinations.filter((e) => e.syllabusUrl).length} with syllabus
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {examinations.filter((e) => e.examDate).length} with dates
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Syllabus Viewer Dialog */}
      <Dialog
        open={viewingSyllabusId !== null}
        onOpenChange={(open) => {
          if (!open) setViewingSyllabusId(null);
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-base">Syllabus Content</DialogTitle>
          </DialogHeader>
          {syllabusQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : syllabusQuery.data ? (
            <div className="space-y-3">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {syllabusQuery.data.status}
                </Badge>
                <span>{syllabusQuery.data.nodes.length} nodes</span>
                {syllabusQuery.data.extractionMethod && (
                  <span>via {syllabusQuery.data.extractionMethod}</span>
                )}
                {syllabusQuery.data.fileUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-5 gap-1 px-2 text-[10px]"
                    onClick={() => {
                      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
                      window.open(`${apiBase}${syllabusQuery.data!.fileUrl}`, "_blank");
                    }}
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    Download PDF
                  </Button>
                )}
              </div>
              {syllabusQuery.data.status === "parsed" && syllabusQuery.data.nodes.length > 0 ? (
                <div className="bg-muted/20 max-h-[55vh] overflow-y-auto rounded-md border p-3">
                  {buildTree(syllabusQuery.data.nodes).map((node) => renderNode(node))}
                </div>
              ) : syllabusQuery.data.status === "processing" ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syllabus is being processed...
                </div>
              ) : syllabusQuery.data.status === "error" ? (
                <div className="bg-destructive/10 text-destructive rounded p-3 text-xs">
                  {syllabusQuery.data.errorMessage ?? "Processing failed"}
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No syllabus content available yet.
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">Syllabus not found.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ───

export default function DocumentDetailPage(): React.ReactElement {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;

  // Filter state
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 25;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Expanded question
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Queries ───

  const docQuery = trpc.portalIngestion.getPortalDocumentById.useQuery({
    id: documentId,
  });

  const doc = docQuery.data;
  const isExaminationSchedule =
    doc?.documentType === "examination_schedule" ||
    (doc?.metadata as Record<string, unknown>)?.type === "examination_schedule";

  const stagedQuery = trpc.portalIngestion.getStagedQuestions.useQuery(
    {
      portalDocumentId: documentId,
      reviewStatus: reviewFilter === "all" ? undefined : (reviewFilter as ReviewStatus),
      page: currentPage,
      limit,
    },
    { enabled: !!doc && !isExaminationSchedule },
  );

  const utils = trpc.useUtils();

  // ─── Mutations ───

  const approveMutation = trpc.portalIngestion.approveQuestions.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      utils.portalIngestion.getStagedQuestions.invalidate();
      utils.portalIngestion.getPortalDocumentById.invalidate();
    },
  });

  const rejectMutation = trpc.portalIngestion.rejectQuestions.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      setRejectDialogOpen(false);
      setRejectReason("");
      utils.portalIngestion.getStagedQuestions.invalidate();
      utils.portalIngestion.getPortalDocumentById.invalidate();
    },
  });

  const reprocessMutation = trpc.portalIngestion.reprocessDocument.useMutation({
    onSuccess: () => {
      utils.portalIngestion.getPortalDocumentById.invalidate();
    },
  });

  // ─── Handlers ───

  const toggleSelect = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((): void => {
    const questions = stagedQuery.data?.questions ?? [];
    const pendingIds = questions.filter((q) => q.reviewStatus === "pending").map((q) => q.id);

    setSelectedIds((prev) => {
      const allSelected = pendingIds.length > 0 && pendingIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(pendingIds);
    });
  }, [stagedQuery.data]);

  function handleApprove(examId: string): void {
    if (selectedIds.size === 0) return;
    approveMutation.mutate({
      stagedQuestionIds: Array.from(selectedIds),
      examId,
    });
  }

  function handleRejectConfirm(): void {
    if (selectedIds.size === 0) return;
    rejectMutation.mutate({
      stagedQuestionIds: Array.from(selectedIds),
      reason: rejectReason || undefined,
    });
  }

  // ─── Derived ───

  const questions = stagedQuery.data?.questions ?? [];
  const totalPages = Math.ceil((stagedQuery.data?.total ?? 0) / limit);
  const pendingQuestions = questions.filter((q) => q.reviewStatus === "pending");

  if (docQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-4">
        <Link href="/scraper/ingest">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <p className="text-muted-foreground py-8 text-center">Document not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/scraper/ingest">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold" title={doc.title ?? undefined}>
            {doc.title ?? "Untitled Document"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {doc.portalName} &middot; {doc.sourcePageType?.replace(/_/g, " ")}
            {isExaminationSchedule && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                Examination Schedule
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {doc.originalUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(doc.originalUrl, "_blank")}
              className="gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View PDF
            </Button>
          )}
          {(doc.processingStatus === "error" || doc.processingStatus === "discovered") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reprocessMutation.mutate({ id: doc.id })}
              disabled={reprocessMutation.isPending}
              className="gap-1"
            >
              {reprocessMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {doc.processingStatus === "discovered" ? "Process" : "Reprocess"}
            </Button>
          )}
        </div>
      </div>

      {/* Document Metadata */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              {statusBadge(doc.processingStatus)}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exam Name</span>
              <span>{doc.examName ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Year</span>
              <span>{doc.examYear ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Document Type</span>
              <span className="capitalize">{doc.documentType?.replace(/_/g, " ")}</span>
            </div>
            {isExaminationSchedule && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entries Extracted</span>
                <span className="font-medium">
                  {(doc.metadata as ExaminationMetadata)?.examinations?.length ?? 0}
                </span>
              </div>
            )}
            {doc.fileSizeBytes && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">File Size</span>
                <span>{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>
              </div>
            )}
            {doc.errorMessage && (
              <div className="bg-destructive/10 text-destructive mt-2 rounded p-2 text-xs">
                {doc.errorMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {isExaminationSchedule ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(() => {
                const exams = (doc.metadata as ExaminationMetadata)?.examinations ?? [];
                const withDates = exams.filter((e) => e.examDate);
                const withSyllabus = exams.filter((e) => e.syllabusUrl);
                const stages = [...new Set(exams.map((e) => e.stage).filter(Boolean))];
                const departments = [...new Set(exams.map((e) => e.department).filter(Boolean))];

                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Entries</span>
                      <Badge variant="outline">{exams.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">With Dates</span>
                      <Badge>{withDates.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">With Syllabus</span>
                      <Badge variant="secondary">{withSyllabus.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stages</span>
                      <span className="text-xs">{stages.join(", ") || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Departments</span>
                      <span
                        className="max-w-[180px] truncate text-xs"
                        title={departments.join(", ")}
                      >
                        {departments.length > 0 ? `${departments.length} unique` : "-"}
                      </span>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Staged Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending</span>
                <Badge variant="outline">{doc.stagedCounts?.pending ?? 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <Badge>{doc.stagedCounts?.approved ?? 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rejected</span>
                <Badge variant="destructive">{doc.stagedCounts?.rejected ?? 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duplicate</span>
                <Badge variant="secondary">{doc.stagedCounts?.duplicate ?? 0}</Badge>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Live Questions</span>
                <span className="font-medium">{doc.linkedQuestionsCount}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Exam Mapper — show for non-examination documents */}
      {!isExaminationSchedule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exam Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Map this document to an exam. All staged questions will inherit this exam link.
            </p>
            <ExamMapper
              documentId={documentId}
              currentExamId={doc.examId}
              onMapped={() => {
                utils.portalIngestion.getPortalDocumentById.invalidate();
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* ─── Examination Schedule Table ─── */}
      {isExaminationSchedule && doc.processingStatus === "processed" && (
        <ExaminationScheduleView
          metadata={doc.metadata as ExaminationMetadata}
          documentId={documentId}
          examId={doc.examId}
        />
      )}

      {/* ─── Staged Questions (non-examination documents) ─── */}
      {!isExaminationSchedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Staged Questions ({stagedQuery.data?.total ?? 0})</span>
              <Button variant="ghost" size="sm" onClick={() => stagedQuery.refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter bar + bulk actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Select
                value={reviewFilter}
                onValueChange={(v) => {
                  setReviewFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Review status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>

              {selectedIds.size > 0 && (
                <div className="flex gap-2">
                  {doc.examId ? (
                    <Button
                      size="sm"
                      onClick={() => handleApprove(doc.examId!)}
                      disabled={approveMutation.isPending}
                      className="gap-1"
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Approve ({selectedIds.size})
                    </Button>
                  ) : (
                    <p className="self-center text-xs text-amber-600">
                      Map an exam first before approving
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={rejectMutation.isPending}
                    className="gap-1"
                  >
                    <X className="h-3 w-3" />
                    Reject ({selectedIds.size})
                  </Button>
                </div>
              )}
            </div>

            {/* Questions table */}
            {stagedQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : questions.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                {doc.processingStatus === "processed"
                  ? "No staged questions found. All may have been reviewed already."
                  : "Document not yet processed. Click Process or Reprocess to extract questions."}
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            pendingQuestions.length > 0 &&
                            pendingQuestions.every((q) => selectedIds.has(q.id))
                          }
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all pending"
                        />
                      </TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="min-w-[300px]">Question</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Difficulty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questions.map((q) => {
                      const content = q.content as McqContent | null;
                      const isExpanded = expandedId === q.id;

                      return (
                        <React.Fragment key={q.id}>
                          <TableRow
                            className={`cursor-pointer ${selectedIds.has(q.id) ? "bg-muted/50" : ""}`}
                            onClick={() => setExpandedId(isExpanded ? null : q.id)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {q.reviewStatus === "pending" && (
                                <Checkbox
                                  checked={selectedIds.has(q.id)}
                                  onCheckedChange={() => toggleSelect(q.id)}
                                  aria-label={`Select question ${q.questionNumber}`}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {q.questionNumber ?? "-"}
                            </TableCell>
                            <TableCell>
                              <span className="line-clamp-2 text-sm">
                                {content?.question ?? "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{q.subject ?? "-"}</TableCell>
                            <TableCell className="text-sm capitalize">
                              {q.difficulty ?? "-"}
                            </TableCell>
                            <TableCell>{reviewBadge(q.reviewStatus)}</TableCell>
                          </TableRow>

                          {/* Expanded detail row */}
                          {isExpanded && content && (
                            <TableRow key={`${q.id}-detail`}>
                              <TableCell colSpan={6} className="bg-muted/30">
                                <div className="space-y-3 px-4 py-2">
                                  <p className="font-medium">{content.question}</p>
                                  <div className="grid gap-1">
                                    {content.options?.map((opt, i) => (
                                      <div
                                        key={i}
                                        className={`rounded px-3 py-1.5 text-sm ${
                                          i === content.answer
                                            ? "bg-green-100 font-medium dark:bg-green-900/30"
                                            : "bg-muted"
                                        }`}
                                      >
                                        <span className="text-muted-foreground mr-2">
                                          {String.fromCharCode(65 + i)}.
                                        </span>
                                        {opt}
                                        {i === content.answer && (
                                          <CheckCircle2 className="ml-2 inline-block h-3 w-3 text-green-600" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {content.explanation && (
                                    <p className="text-muted-foreground text-sm">
                                      <span className="font-medium">Explanation:</span>{" "}
                                      {content.explanation}
                                    </p>
                                  )}
                                  {q.suggestedExamName && (
                                    <p className="text-muted-foreground text-xs">
                                      Suggested exam: {q.suggestedExamName}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-muted-foreground text-xs">
                      Page {currentPage} of {totalPages} ({stagedQuery.data?.total} total)
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Mutation feedback */}
            {approveMutation.isSuccess && (
              <p className="text-sm text-green-600">
                Approved {approveMutation.data.approved} questions.
              </p>
            )}
            {approveMutation.error && (
              <p className="text-destructive text-sm">{approveMutation.error.message}</p>
            )}
            {rejectMutation.error && (
              <p className="text-destructive text-sm">{rejectMutation.error.message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reject {selectedIds.size} Question(s)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reject-reason">Reason (optional)</Label>
              <Textarea
                id="reject-reason"
                placeholder="e.g. Duplicate question, incorrect options..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
