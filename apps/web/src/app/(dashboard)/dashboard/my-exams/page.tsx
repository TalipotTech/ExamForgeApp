"use client";

import { FileQuestion, Trash2, Play, Clock, Trophy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

export default function MyExamsPage(): React.ReactElement {
  const examsQuery = trpc.tutorialAgent.listUserExams.useQuery({});
  const deleteExamMutation = trpc.tutorialAgent.deleteUserExam.useMutation({
    onSuccess: () => {
      toast.success("Exam deleted");
      examsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (examsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <h1 className="text-2xl font-bold">My Practice Exams</h1>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const exams = examsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Practice Exams</h1>
        <Badge variant="secondary">{exams.length} exams</Badge>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">
            <FileQuestion className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-lg font-medium">No practice exams yet</p>
            <p className="mt-1 text-sm">
              Generate practice exams from tutorials to start practicing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <h3 className="font-semibold">{exam.title}</h3>
                  <div className="text-muted-foreground mt-1 flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <FileQuestion className="h-3.5 w-3.5" />
                      {exam.questionCount} questions
                    </span>
                    {exam.timesAttempted !== null && exam.timesAttempted > 0 && (
                      <span className="flex items-center gap-1">
                        <Play className="h-3.5 w-3.5" />
                        {exam.timesAttempted} attempts
                      </span>
                    )}
                    {exam.bestScore !== null && (
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                        Best: {Math.round(exam.bestScore * 100)}%
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(exam.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      setDeletingId(exam.id);
                      deleteExamMutation.mutate(
                        { id: exam.id },
                        { onSettled: () => setDeletingId(null) },
                      );
                    }}
                    disabled={deletingId === exam.id}
                  >
                    {deletingId === exam.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
