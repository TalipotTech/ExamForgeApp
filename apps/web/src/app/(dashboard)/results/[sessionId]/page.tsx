"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ExamResults } from "@/components/exam/exam-results";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ResultsPage(): React.ReactElement {
  const params = useParams<{ sessionId: string }>();

  const { data, isLoading, error } = trpc.examSession.getResults.useQuery(
    { sessionId: params.sessionId },
    { enabled: !!params.sessionId, refetchOnWindowFocus: false },
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-lg font-medium text-destructive">
          Failed to load results
        </p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button asChild>
          <Link href={"/exams/start" as "/"}>Start New Exam</Link>
        </Button>
      </div>
    );
  }

  if (!data) return <div />;

  return <ExamResults data={data} />;
}
