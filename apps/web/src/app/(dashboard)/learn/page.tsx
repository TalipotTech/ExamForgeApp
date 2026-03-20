"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Clock, FileText, ArrowRight, Plus, GraduationCap } from "lucide-react";
import { BrowseExamsDialog } from "@/components/exam/browse-exams-dialog";

export default function LearnPage(): React.ReactElement {
  const syllabiQuery = trpc.learn.listSyllabiWithTutorials.useQuery();
  const [browseOpen, setBrowseOpen] = useState(false);

  if (syllabiQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Learn</h1>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const syllabi = syllabiQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Learn</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse tutorials by syllabus. Track your learning progress.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setBrowseOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Examination
        </Button>
      </div>

      {syllabi.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GraduationCap className="text-muted-foreground h-12 w-12" />
            <div>
              <p className="font-medium">No tutorials available yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Add examinations to your preparation list, then tutorials will appear here once
                generated.
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              className="mt-2"
              onClick={() => setBrowseOpen(true)}
            >
              <Plus className="mr-1 h-4 w-4" />
              Browse Examinations
            </Button>
          </CardContent>
        </Card>
      ) : (
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
      )}

      <BrowseExamsDialog open={browseOpen} onOpenChange={setBrowseOpen} />
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
