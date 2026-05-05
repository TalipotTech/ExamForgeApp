"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Paperclip, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export default function CreatorAssignmentSubmissionsPage(props: {
  params: Promise<{ id: string; assignmentId: string }>;
}): React.ReactElement {
  const { id, assignmentId } = use(props.params);

  const assignmentQuery = trpc.assignment.byId.useQuery({ assignmentId });
  const submissionsQuery = trpc.assignment.listSubmissions.useQuery({ assignmentId });

  if (assignmentQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (assignmentQuery.error || !assignmentQuery.data) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {assignmentQuery.error?.message ?? "Assignment not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { assignment, classroom, isTeacher } = assignmentQuery.data;

  if (!isTeacher) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            Only the teacher of this classroom can view submissions.
          </CardContent>
        </Card>
      </div>
    );
  }

  const submissions = submissionsQuery.data ?? [];
  const due = assignment.dueAt ? new Date(assignment.dueAt) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href={`/creator/classrooms/${id}`}>
          <ArrowLeft className="mr-1 size-4" />
          {classroom.name}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">{assignment.title}</h1>
        {assignment.instructions && (
          <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-sm">
            {assignment.instructions}
          </p>
        )}
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <Users className="size-3" />
            {assignment.completedCount ?? 0} / {assignment.totalStudents ?? 0} submitted
          </Badge>
          {typeof assignment.averageScore === "number" && (
            <Badge variant="secondary">avg {assignment.averageScore.toFixed(1)}</Badge>
          )}
          {due && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              due {due.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )}
          {assignment.attachmentUrl && assignment.attachmentFileName && (
            <a
              href={assignment.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary inline-flex items-center gap-1 underline"
            >
              <Paperclip className="size-3" />
              {assignment.attachmentFileName}
            </a>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Submissions</h2>
        {submissionsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : submissions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm">
              <p className="font-medium">No submissions yet.</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Students who complete this assignment will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          submissions.map((s) => (
            <SubmissionRow
              key={s.id}
              submission={s}
              onGraded={() => {
                void submissionsQuery.refetch();
                void assignmentQuery.refetch();
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

type SubmissionRowData = {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  status: string;
  score: number | null;
  submissionText: string | null;
  submissionUrl: string | null;
  submissionFileName: string | null;
  submissionMimeType: string | null;
  feedback: string | null;
  submittedAt: Date | string | null;
  gradedAt: Date | string | null;
};

function SubmissionRow({
  submission,
  onGraded,
}: {
  submission: SubmissionRowData;
  onGraded: () => void;
}): React.ReactElement {
  const [score, setScore] = useState<string>(submission.score?.toString() ?? "");
  const [feedback, setFeedback] = useState<string>(submission.feedback ?? "");

  useEffect(() => {
    setScore(submission.score?.toString() ?? "");
    setFeedback(submission.feedback ?? "");
  }, [submission.score, submission.feedback]);

  const gradeMutation = trpc.assignment.grade.useMutation({
    onSuccess: () => {
      toast.success(`Graded ${submission.studentName ?? "submission"}`);
      onGraded();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleGrade(): void {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }
    gradeMutation.mutate({
      submissionId: submission.id,
      score: numericScore,
      feedback: feedback.trim() || undefined,
    });
  }

  const graded = submission.status === "graded";
  const submittedAt = submission.submittedAt ? new Date(submission.submittedAt) : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">
              {submission.studentName ?? submission.studentEmail ?? "Student"}
            </div>
            <div className="text-muted-foreground text-xs">
              {submission.studentEmail}
              {submittedAt &&
                ` · submitted ${submittedAt.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`}
            </div>
          </div>
          <Badge variant={graded ? "default" : "secondary"} className="text-[10px]">
            {submission.status}
          </Badge>
        </div>

        {submission.submissionText && (
          <div className="bg-muted/30 whitespace-pre-wrap rounded border p-2 text-sm">
            {submission.submissionText}
          </div>
        )}
        {submission.submissionUrl && submission.submissionFileName && (
          <a
            href={submission.submissionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary inline-flex items-center gap-1 text-sm underline"
          >
            <Paperclip className="size-3" />
            {submission.submissionFileName}
          </a>
        )}

        <div className="grid gap-3 sm:grid-cols-[100px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={`score-${submission.id}`} className="text-xs">
              Score (0-100)
            </Label>
            <Input
              id={`score-${submission.id}`}
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`feedback-${submission.id}`} className="text-xs">
              Comment (optional)
            </Label>
            <Textarea
              id={`feedback-${submission.id}`}
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Feedback for the student"
            />
          </div>
          <Button size="sm" disabled={gradeMutation.isPending} onClick={handleGrade}>
            <Save className="mr-1 size-3" />
            {gradeMutation.isPending ? "Saving…" : graded ? "Update" : "Grade"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
