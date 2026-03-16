"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Clock, FileText, ArrowRight } from "lucide-react";

export default function LearnPage(): React.ReactElement {
  const syllabiQuery = trpc.learn.listSyllabiWithTutorials.useQuery();

  if (syllabiQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Learn</h1>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const syllabi = syllabiQuery.data ?? [];

  if (syllabi.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Learn</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <p className="text-muted-foreground">
              No tutorials available yet. Generate tutorials from the admin panel first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Learn</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse tutorials by syllabus. Track your learning progress.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {syllabi.map((syl) => (
          <SyllabusCard
            key={syl.syllabusId}
            syllabusId={syl.syllabusId}
            syllabusName={syl.syllabusName}
            examName={syl.examName}
          />
        ))}
      </div>
    </div>
  );
}

function SyllabusCard({
  syllabusId,
  syllabusName,
  examName,
}: {
  syllabusId: number;
  syllabusName: string;
  examName: string;
}): React.ReactElement {
  const treeQuery = trpc.learn.getSyllabusLearningTree.useQuery(
    { syllabusId },
    { staleTime: 5 * 60 * 1000 },
  );

  const stats = treeQuery.data?.stats;

  return (
    <Link href={`/learn/${syllabusId}`}>
      <Card className="hover:border-primary/30 h-full transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">{syllabusName}</CardTitle>
              <CardDescription className="mt-1">{examName}</CardDescription>
            </div>
            <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
          </div>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {stats.totalTopics} topics
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {stats.completedTopics} completed
                </span>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{stats.overallPercent}%</span>
                </div>
                <Progress value={stats.overallPercent} className="h-2" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <BookOpen className="mr-1 h-3 w-3" />
                Start learning
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
