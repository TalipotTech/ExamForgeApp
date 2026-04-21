"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PatternDashboard } from "@/components/exam/pattern-dashboard";
import { Play, Repeat, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";

const ADMIN_ROLES = ["admin", "superadmin"];

export default function ExamHubPage(): React.ReactElement {
  const params = useParams();
  const { data: session } = useSession();
  const examId = params.examId as string;
  const isAdmin = ADMIN_ROLES.includes(session?.user?.role ?? "");

  const { data: exam, isLoading: examLoading } = trpc.exam.getById.useQuery({ id: examId });

  const { data: pattern } = trpc.examPattern.getPattern.useQuery(
    { examId },
    { staleTime: 5 * 60_000 },
  );

  // Pattern-exam generation is queued (see /exams/start for the full
  // polling UX). Here we just fire-and-toast — the user will find the
  // resulting practice exam in their exam history in ~60s once the
  // pattern-exam-generation-worker finishes.
  const generateMutation = trpc.examPattern.generatePatternExam.useMutation({
    onSuccess: () => {
      toast.success("Pattern exam queued. It'll appear in your exam history in ~60 seconds.");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (examLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!exam) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center">
          <p>Exam not found.</p>
        </CardContent>
      </Card>
    );
  }

  const hasPattern = Boolean(pattern);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{exam.name}</h1>
          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            {exam.category && <Badge variant="secondary">{exam.category}</Badge>}
            {exam.conductingBody && <span>{exam.conductingBody}</span>}
            {hasPattern && (
              <Badge variant="outline" className="text-green-600">
                Pattern Available
              </Badge>
            )}
          </div>
        </div>
        {isAdmin && (
          <Link href={`/dashboard/exam/${examId}/patterns` as "/"}>
            <Button variant="outline" size="sm">
              <Settings className="size-4" />
              Manage Patterns
            </Button>
          </Link>
        )}
      </div>

      {/* Action cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Pattern Exam */}
        <Card className={hasPattern ? "border-primary/40" : "opacity-60"}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="text-primary size-4" />
              Pattern Exam
            </CardTitle>
            <CardDescription>
              {hasPattern
                ? "100 questions matching the real exam's subject weightage, difficulty, and styles."
                : "Available after pattern analysis is run on past papers."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() =>
                generateMutation.mutate({
                  examId,
                  questionCount: 100,
                  includeRepeats: true,
                  includeCurrentAffairs: true,
                })
              }
              disabled={!hasPattern || generateMutation.isPending}
              className="w-full"
              size="sm"
            >
              <Play className="size-4" />
              {generateMutation.isPending ? "Generating..." : "Start Pattern Exam"}
            </Button>
          </CardContent>
        </Card>

        {/* Repeat Candidates */}
        <Card className={hasPattern ? "" : "opacity-60"}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="size-4 text-amber-600" />
              Most Likely to Repeat
            </CardTitle>
            <CardDescription>
              Questions that have appeared multiple times across previous years.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/dashboard/exam/${examId}/repeats` as "/"} className="block">
              <Button variant="outline" className="w-full" size="sm" disabled={!hasPattern}>
                View Repeat Candidates
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Practice Exam (standard) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="size-4 text-blue-600" />
              Quick Practice
            </CardTitle>
            <CardDescription>
              Configure a custom-length practice session from this exam's question bank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/exams/start?examId=${examId}` as "/"} className="block">
              <Button variant="outline" className="w-full" size="sm">
                Configure & Start
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Pattern dashboard */}
      <PatternDashboard examId={examId} />
    </div>
  );
}
