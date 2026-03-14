"use client";

import { useState } from "react";
import { Play, Pause, Loader2, CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AdminTutorialsPage(): React.ReactElement {
  const [syllabusId, setSyllabusId] = useState("");
  const [examId, setExamId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

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
    onSuccess: () => {
      toast.info("Generation paused");
      jobsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resumeMutation = trpc.tutorialAgent.resumeGeneration.useMutation({
    onSuccess: () => {
      toast.success("Generation resumed");
      jobsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

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
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Tutorial Generation</h1>

      {/* Start New Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Start New Generation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-muted-foreground mb-1 block text-sm">Syllabus ID</label>
              <Input
                type="number"
                placeholder="e.g. 1"
                value={syllabusId}
                onChange={(e) => setSyllabusId(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-muted-foreground mb-1 block text-sm">Exam ID (UUID)</label>
              <Input
                placeholder="e.g. abc123..."
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
              />
            </div>
            <Button
              onClick={() => {
                if (!syllabusId || !examId) {
                  toast.error("Both Syllabus ID and Exam ID are required");
                  return;
                }
                startMutation.mutate({
                  syllabusId: Number(syllabusId),
                  examId,
                  providers: ["claude"],
                  generatePreviews: true,
                  previewPercentage: 30,
                });
              }}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Start Generation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Job Status */}
      {selectedJobId && statusQuery.data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Job #{statusQuery.data.id} Progress</CardTitle>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
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

            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Completed</p>
                <p className="text-lg font-semibold text-green-600">
                  {statusQuery.data.completedNodes ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Failed</p>
                <p className="text-lg font-semibold text-red-600">
                  {statusQuery.data.failedNodes ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tokens Used</p>
                <p className="text-lg font-semibold">
                  {(statusQuery.data.totalTokens ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost (USD)</p>
                <p className="text-lg font-semibold">
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
        <CardHeader>
          <CardTitle className="text-lg">Generation History</CardTitle>
        </CardHeader>
        <CardContent>
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
                  className="hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors"
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Job #{job.id}</span>
                      {statusBadge(job.status)}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {job.completedNodes ?? 0}/{job.totalNodes} topics
                      {job.totalCostUsd ? ` · $${job.totalCostUsd.toFixed(4)}` : ""}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {new Date(job.createdAt).toLocaleDateString()}
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
