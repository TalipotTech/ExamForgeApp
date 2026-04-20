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
import { FlaskConical, Search as SearchIcon, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_COUNT = 10;

export default function AdminGenerationPage(): React.ReactElement {
  const examsQuery = trpc.exam.listForAdmin.useQuery();
  const [examId, setExamId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({});

  const nodesQuery = trpc.topicGeneration.listNodesForExam.useQuery(
    { examId: examId! },
    { enabled: Boolean(examId), staleTime: 30_000 },
  );

  const utils = trpc.useUtils();
  const generateMutation = trpc.topicGeneration.generate.useMutation({
    onSuccess: (d, vars) => {
      toast.success(`Queued generation for node ${vars.syllabusNodeId}`);
      void utils.topicGeneration.listNodesForExam.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    const nodes = nodesQuery.data?.nodes ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return nodes;
    return nodes.filter(
      (n) =>
        n.title.toLowerCase().includes(term) ||
        n.parentTitle?.toLowerCase().includes(term) ||
        n.description?.toLowerCase().includes(term),
    );
  }, [nodesQuery.data, search]);

  const totals = useMemo(() => {
    const nodes = nodesQuery.data?.nodes ?? [];
    return {
      nodes: nodes.length,
      generatableNodes: nodes.filter((n) => n.canGenerate).length,
      totalSeeds: nodes.reduce((a, n) => a + n.seedCount, 0),
      totalAi: nodes.reduce((a, n) => a + n.topicAiCount, 0),
    };
  }, [nodesQuery.data]);

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
          already mapped to that topic as style/difficulty seeds. Output runs through the 6-layer
          verification pipeline automatically.{" "}
          <Link href={"/admin/verification" as "/"} className="underline">
            Review generated questions →
          </Link>
        </p>
      </div>

      {/* Exam picker */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base">Pick an exam</CardTitle>
          <div className="w-80">
            <Select value={examId ?? ""} onValueChange={(v) => setExamId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an exam..." />
              </SelectTrigger>
              <SelectContent>
                {(examsQuery.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Summary chips */}
      {examId && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="Syllabus nodes" value={totals.nodes} />
          <StatChip label="Generatable" value={totals.generatableNodes} tone="ok" />
          <StatChip label="Real + textbook seeds" value={totals.totalSeeds} tone="ok" />
          <StatChip label="Topic-AI generated" value={totals.totalAi} tone="neutral" />
        </div>
      )}

      {/* Nodes table */}
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
            ) : filtered.length === 0 ? (
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
                  {filtered.slice(0, 200).map((n) => (
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
            {filtered.length > 200 && (
              <p className="text-muted-foreground mt-2 text-center text-xs">
                Showing 200 of {filtered.length} — refine the search.
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
