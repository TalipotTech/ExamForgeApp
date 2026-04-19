"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { PatternDashboard } from "@/components/exam/pattern-dashboard";
import { toast } from "sonner";

export default function ExamPatternsPage(): React.ReactElement {
  const params = useParams();
  const examId = params.examId as string;

  const { data: status, isLoading: statusLoading } =
    trpc.examPattern.getClassificationStatus.useQuery({ examId }, { staleTime: 30_000 });

  const { data: papers, isLoading: papersLoading } = trpc.examPattern.getPaperAnalysis.useQuery(
    { examId },
    { staleTime: 60_000 },
  );

  const utils = trpc.useUtils();

  const analyzeMutation = trpc.examPattern.analyzeExistingPapers.useMutation({
    onSuccess: (data) => {
      toast.success(`Queued ${data.papersToClassify} classification jobs + 1 analysis job`);
      utils.examPattern.getClassificationStatus.invalidate({ examId });
    },
    onError: (err) => {
      toast.error(`Analysis failed: ${err.message}`);
    },
  });

  const generateMutation = trpc.examPattern.generatePatternExam.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated pattern exam with ${data.questionCount} questions`);
    },
    onError: (err) => {
      toast.error(`Generation failed: ${err.message}`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pattern Analysis</h1>
          <p className="text-muted-foreground">
            Analyze previous year papers to identify exam patterns
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => analyzeMutation.mutate({ examId, forceReanalyze: false })}
            disabled={analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? "Analyzing..." : "Run Analysis"}
          </Button>
          <Button
            onClick={() => generateMutation.mutate({ examId, questionCount: 100 })}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? "Generating..." : "Generate Pattern Exam"}
          </Button>
        </div>
      </div>

      {/* Classification Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Classification Status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : status ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">Total Papers</p>
                <p className="text-xl font-semibold">{status.totalPapers}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Classified</p>
                <p className="text-xl font-semibold text-green-600">{status.classifiedPapers}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">In Progress</p>
                <p className="text-xl font-semibold text-yellow-600">{status.classifyingPapers}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Questions Classified</p>
                <p className="text-xl font-semibold">{status.totalQuestionsClassified}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No data available</p>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Pattern Dashboard */}
      <PatternDashboard examId={examId} />

      <Separator />

      {/* Per-Paper Analysis Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paper-by-Paper Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {papersLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : papers && papers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Repeats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {papers.map((paper) => (
                  <TableRow key={paper.id}>
                    <TableCell className="font-medium">{paper.year}</TableCell>
                    <TableCell>{paper.paperNumber ?? "-"}</TableCell>
                    <TableCell>{paper.totalQuestions}</TableCell>
                    <TableCell>{paper.repeatedQuestions ?? 0}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          paper.status === "classified"
                            ? "default"
                            : paper.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {paper.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {paper.source ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No paper analyses found. Run analysis to get started.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
