"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  Calendar,
  FileText,
  BookOpen,
  Search,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

// ─── Types ───

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

type SyllabusLink = {
  url: string;
  entryKey: string;
  syllabusId: number;
  examName: string;
  status: string;
};

// ─── Badge Helpers ───

function examStageBadge(stage?: string): React.ReactElement | null {
  if (!stage) return null;
  const colors: Record<string, string> = {
    preliminary: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    main: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    interview: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    descriptive: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    omr: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
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

// ─── Highlight helper ───

function Highlight({ text, term }: { text: string; term: string }): React.ReactElement {
  if (!term) return <>{text}</>;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800/60">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ─── Syllabus Tree ───

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

function RenderNode({
  node,
  level = 0,
}: {
  node: SyllabusNode;
  level?: number;
}): React.ReactElement {
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
    <div>
      <div className={`py-1 text-xs ${cls}`} style={{ paddingLeft: `${indent}px` }}>
        <span className="text-muted-foreground mr-1.5 text-[9px] uppercase">{node.nodeType}</span>
        {node.title}
        {node.description && (
          <span className="text-muted-foreground ml-1">— {node.description}</span>
        )}
      </div>
      {node.children.map((child) => (
        <RenderNode key={child.id} node={child} level={level + 1} />
      ))}
    </div>
  );
}

// ─── Main Content ───

function ExaminationDetailContent(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const documentId = params.documentId as string;
  const initialSearch = searchParams.get("search") ?? "";

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [viewingSyllabusId, setViewingSyllabusId] = useState<number | null>(null);

  const { data, isLoading } = trpc.portalIngestion.getExaminationEntries.useQuery({
    documentId,
  });

  const syllabusQuery = trpc.portalIngestion.getPublicSyllabusData.useQuery(
    { syllabusId: viewingSyllabusId! },
    { enabled: viewingSyllabusId !== null },
  );

  const allExaminations = data?.examinations ?? [];
  const doc = data?.document;
  const syllabusLinks = data?.syllabusLinks ?? [];

  // Client-side filtering — no API call on search
  const examinations = useMemo(() => {
    if (!searchTerm) return allExaminations;
    const term = searchTerm.toLowerCase();
    return allExaminations.filter(
      (e) =>
        e.examName.toLowerCase().includes(term) ||
        e.postName?.toLowerCase().includes(term) ||
        e.categoryNumber?.toLowerCase().includes(term) ||
        e.department?.toLowerCase().includes(term),
    );
  }, [allExaminations, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-muted-foreground py-20 text-center">
        <FileText className="mx-auto mb-3 size-10 opacity-30" />
        <p>Examination schedule not found.</p>
        <Link href={"/examinations" as "/"}>
          <Button variant="link" className="mt-2">
            Back to examinations
          </Button>
        </Link>
      </div>
    );
  }

  function entryKey(entry: ExaminationEntry): string {
    return `${entry.examName}::${entry.categoryNumber ?? ""}`;
  }

  function getSyllabusLink(entry: ExaminationEntry): SyllabusLink | undefined {
    return syllabusLinks.find((s) => s.entryKey === entryKey(entry));
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={"/examinations" as "/"}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to examinations
      </Link>

      {/* Document header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {doc.portalName}
          </Badge>
          {doc.examCategory && (
            <Badge variant="outline" className="text-xs capitalize">
              {doc.examCategory}
            </Badge>
          )}
        </div>
        <h1 className="text-lg font-semibold capitalize leading-snug sm:text-xl">
          {(doc.title ?? doc.examName ?? "Examination Schedule").toLowerCase()}
        </h1>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Calendar className="size-4" />
          {data.total} examinations
          {syllabusLinks.length > 0 && (
            <span className="text-muted-foreground/70">
              &middot; {syllabusLinks.length} with syllabus
            </span>
          )}
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search exams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Examination cards — mobile-first */}
      {examinations.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <FileText className="mx-auto mb-3 size-8 opacity-30" />
          <p className="text-sm">
            {searchTerm ? "No examinations matching search." : "No examination entries found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {examinations.map((entry, idx) => {
            const link = getSyllabusLink(entry);
            return (
              <Card key={idx} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* Title — always fully visible */}
                  <h3 className="text-sm font-semibold leading-snug">
                    <span className="text-muted-foreground mr-1.5 text-xs">{idx + 1}.</span>
                    <Highlight text={entry.examName} term={searchTerm} />
                  </h3>

                  {/* Post name */}
                  {entry.postName && (
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      <Highlight text={entry.postName} term={searchTerm} />
                    </p>
                  )}

                  {/* Meta row — wraps on mobile */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {entry.categoryNumber && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Cat. {entry.categoryNumber}
                      </Badge>
                    )}
                    {entry.examDate && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Calendar className="size-2.5" />
                        {entry.examDate}
                      </Badge>
                    )}
                    {examStageBadge(entry.stage)}
                    {examStatusBadge(entry.status)}
                  </div>

                  {/* Department / extra info */}
                  {(entry.department || entry.venue || entry.examTime) && (
                    <div className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                      {entry.department && (
                        <p>
                          <span className="font-medium">Dept:</span>{" "}
                          <Highlight text={entry.department} term={searchTerm} />
                        </p>
                      )}
                      {entry.venue && (
                        <p>
                          <span className="font-medium">Venue:</span> {entry.venue}
                        </p>
                      )}
                      {entry.examTime && (
                        <p>
                          <span className="font-medium">Time:</span> {entry.examTime}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Syllabus action */}
                  {link && (
                    <div className="mt-3 border-t pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-green-700 dark:text-green-400"
                        onClick={() => setViewingSyllabusId(link.syllabusId)}
                      >
                        <BookOpen className="size-3" />
                        View Syllabus
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Syllabus Viewer Dialog */}
      <Dialog
        open={viewingSyllabusId !== null}
        onOpenChange={(open) => {
          if (!open) setViewingSyllabusId(null);
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-base">Syllabus</DialogTitle>
          </DialogHeader>
          {syllabusQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : syllabusQuery.data ? (
            <div className="space-y-3">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {syllabusQuery.data.status}
                </Badge>
                <span>{syllabusQuery.data.nodes.length} nodes</span>
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
                    <ExternalLink className="size-2.5" />
                    Download PDF
                  </Button>
                )}
              </div>
              {syllabusQuery.data.status === "parsed" && syllabusQuery.data.nodes.length > 0 ? (
                <div className="bg-muted/20 max-h-[55vh] overflow-y-auto rounded-md border p-3">
                  {buildTree(syllabusQuery.data.nodes).map((node) => (
                    <RenderNode key={node.id} node={node} />
                  ))}
                </div>
              ) : syllabusQuery.data.status === "processing" ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Syllabus is being processed...
                </div>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No syllabus content available yet.
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">Syllabus not found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ExaminationDetailPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      }
    >
      <ExaminationDetailContent />
    </Suspense>
  );
}
