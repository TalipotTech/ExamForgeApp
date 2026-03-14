"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  RotateCcw,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AdminTutorialsPage(): React.ReactElement {
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedSyllabusId, setSelectedSyllabusId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  // Fetch exams that have at least one parsed syllabus
  const examsQuery = trpc.tutorialAgent.listExamsWithSyllabi.useQuery();

  // Fetch syllabi for the selected exam
  const syllabiQuery = trpc.syllabus.list.useQuery(
    { examId: selectedExamId },
    { enabled: selectedExamId !== "" },
  );

  // Only show syllabi with status 'parsed'
  const parsedSyllabi = (syllabiQuery.data ?? []).filter((s) => s.status === "parsed");

  // Fetch generated tutorials for the selected syllabus
  const tutorialsQuery = trpc.tutorialAgent.listGeneratedTutorials.useQuery(
    { syllabusId: Number(selectedSyllabusId) },
    { enabled: selectedSyllabusId !== "" },
  );

  const jobsQuery = trpc.tutorialAgent.listGenerationJobs.useQuery();

  const statusQuery = trpc.tutorialAgent.getGenerationStatus.useQuery(
    { jobId: selectedJobId! },
    { enabled: selectedJobId !== null, refetchInterval: 3000 },
  );

  const startMutation = trpc.tutorialAgent.startGeneration.useMutation({
    onSuccess: (data) => {
      toast.success(`Generation started! Job #${data.jobId}`);
      setSelectedJobId(data.jobId);
      jobsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const pauseMutation = trpc.tutorialAgent.pauseGeneration.useMutation({
    onSuccess: (): void => {
      toast.info("Generation paused");
      jobsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resumeMutation = trpc.tutorialAgent.resumeGeneration.useMutation({
    onSuccess: (): void => {
      toast.success("Generation resumed");
      jobsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const retryFailedMutation = trpc.tutorialAgent.retryFailed.useMutation({
    onSuccess: (data) => {
      toast.success(`Retrying ${data.failedCount} failed tutorials — Job #${data.jobId}`);
      setSelectedJobId(data.jobId);
      jobsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleExamChange = (examId: string): void => {
    setSelectedExamId(examId);
    setSelectedSyllabusId(""); // reset syllabus when exam changes
  };

  const statusBadge = (status: string): React.ReactElement => {
    const variants: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
    > = {
      queued: { variant: "secondary", icon: <Clock className="mr-1 h-3 w-3" /> },
      running: { variant: "default", icon: <Loader2 className="mr-1 h-3 w-3 animate-spin" /> },
      paused: { variant: "outline", icon: <Pause className="mr-1 h-3 w-3" /> },
      completed: {
        variant: "secondary",
        icon: <CheckCircle className="mr-1 h-3 w-3 text-green-500" />,
      },
      error: { variant: "destructive", icon: <XCircle className="mr-1 h-3 w-3" /> },
    };
    const v = variants[status] ?? variants["queued"]!;
    return (
      <Badge variant={v.variant}>
        {v.icon}
        {status}
      </Badge>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-2 sm:p-4">
      <h1 className="text-xl font-bold sm:text-2xl">Tutorial Generation</h1>

      {/* Start New Generation */}
      <Card>
        <CardHeader className="px-4 pb-3 sm:px-6">
          <CardTitle className="text-base sm:text-lg">Start New Generation</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-muted-foreground mb-1 block text-sm">Examination</label>
                <select
                  className="border-input bg-background ring-offset-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
                  value={selectedExamId}
                  onChange={(e) => handleExamChange(e.target.value)}
                  disabled={examsQuery.isLoading}
                >
                  <option value="">
                    {examsQuery.isLoading ? "Loading exams..." : "Select an examination"}
                  </option>
                  {(examsQuery.data ?? []).map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                      {exam.conductingBody ? ` (${exam.conductingBody})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-sm">Syllabus</label>
                <select
                  className="border-input bg-background ring-offset-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
                  value={selectedSyllabusId}
                  onChange={(e) => setSelectedSyllabusId(e.target.value)}
                  disabled={!selectedExamId || syllabiQuery.isLoading}
                >
                  <option value="">
                    {!selectedExamId
                      ? "Select an exam first"
                      : syllabiQuery.isLoading
                        ? "Loading syllabi..."
                        : parsedSyllabi.length === 0
                          ? "No parsed syllabi found"
                          : "Select a syllabus"}
                  </option>
                  {parsedSyllabi.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!selectedExamId || !selectedSyllabusId) {
                    toast.error("Select both an examination and a syllabus");
                    return;
                  }
                  startMutation.mutate({
                    syllabusId: Number(selectedSyllabusId),
                    examId: selectedExamId,
                    providers: ["claude"],
                    generatePreviews: true,
                    previewPercentage: 30,
                  });
                }}
                disabled={startMutation.isPending || !selectedExamId || !selectedSyllabusId}
              >
                {startMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Start Generation
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Browse Generated Tutorials */}
      {selectedSyllabusId && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BookOpen className="h-5 w-5" />
                Generated Tutorials
              </CardTitle>
              {tutorialsQuery.data && (
                <Badge variant="secondary">{tutorialsQuery.data.length} tutorials</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {tutorialsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !tutorialsQuery.data || tutorialsQuery.data.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No tutorials generated yet for this syllabus. Start a generation above.
              </p>
            ) : (
              <div className="space-y-1">
                {tutorialsQuery.data.map((tutorial) => (
                  <Link
                    key={tutorial.id}
                    href={`/dashboard/tutorial/${tutorial.syllabusNodeId}` as "/"}
                    className="hover:bg-muted/50 flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{tutorial.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {tutorial.wordCount?.toLocaleString() ?? "—"} words
                        {tutorial.sectionsCount ? ` · ${tutorial.sectionsCount} sections` : ""}
                        {tutorial.estimatedReadMinutes
                          ? ` · ${tutorial.estimatedReadMinutes} min read`
                          : ""}
                      </p>
                    </div>
                    <ExternalLink className="text-muted-foreground ml-2 h-4 w-4 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Job Status */}
      {selectedJobId && statusQuery.data && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base sm:text-lg">
                Job #{statusQuery.data.id} Progress
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(statusQuery.data.status)}
                {statusQuery.data.status === "running" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pauseMutation.mutate({ jobId: selectedJobId })}
                  >
                    <Pause className="mr-1 h-3 w-3" />
                    Pause
                  </Button>
                )}
                {statusQuery.data.status === "paused" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resumeMutation.mutate({ jobId: selectedJobId })}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Resume
                  </Button>
                )}
                {(statusQuery.data.status === "completed" || statusQuery.data.status === "error") &&
                  (statusQuery.data.failedNodes ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryFailedMutation.mutate({ jobId: selectedJobId })}
                      disabled={retryFailedMutation.isPending}
                    >
                      {retryFailedMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1 h-3 w-3" />
                      )}
                      Retry {statusQuery.data.failedNodes} Failed
                    </Button>
                  )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-sm">
                <span>
                  {statusQuery.data.completedNodes ?? 0} / {statusQuery.data.totalNodes} topics
                </span>
                <span>
                  {Math.round(
                    ((statusQuery.data.completedNodes ?? 0) / statusQuery.data.totalNodes) * 100,
                  )}
                  %
                </span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${((statusQuery.data.completedNodes ?? 0) / statusQuery.data.totalNodes) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:gap-4 md:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs sm:text-sm">Completed</p>
                <p className="text-base font-semibold text-green-600 sm:text-lg">
                  {statusQuery.data.completedNodes ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs sm:text-sm">Failed</p>
                <p className="text-base font-semibold text-red-600 sm:text-lg">
                  {statusQuery.data.failedNodes ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs sm:text-sm">Tokens Used</p>
                <p className="text-base font-semibold sm:text-lg">
                  {(statusQuery.data.totalTokens ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs sm:text-sm">Cost (USD)</p>
                <p className="text-base font-semibold sm:text-lg">
                  ${(statusQuery.data.totalCostUsd ?? 0).toFixed(4)}
                </p>
              </div>
            </div>

            {statusQuery.data.currentNodeTitle && (
              <p className="text-muted-foreground mt-3 text-sm">
                Currently generating:{" "}
                <span className="text-foreground font-medium">
                  {statusQuery.data.currentNodeTitle}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      <Card>
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg">Generation History</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {jobsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (jobsQuery.data ?? []).length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No generation jobs yet.
            </p>
          ) : (
            <div className="space-y-2">
              {(jobsQuery.data ?? []).map((job) => (
                <div
                  key={job.id}
                  className={`hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                    selectedJobId === job.id ? "border-primary bg-muted/30" : ""
                  }`}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Job #{job.id}</span>
                      {statusBadge(job.status)}
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-sm">
                      {job.completedNodes ?? 0}/{job.totalNodes} topics
                      {(job.failedNodes ?? 0) > 0 && (
                        <span className="text-red-500"> · {job.failedNodes} failed</span>
                      )}
                      {job.totalCostUsd ? ` · $${job.totalCostUsd.toFixed(4)}` : ""}
                    </p>
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-2">
                    {(job.status === "completed" || job.status === "error") &&
                      (job.failedNodes ?? 0) > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="hidden sm:inline-flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryFailedMutation.mutate({ jobId: job.id });
                          }}
                          disabled={retryFailedMutation.isPending}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    <span className="text-muted-foreground hidden text-sm sm:inline">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
