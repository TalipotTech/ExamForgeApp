"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { TopicPredictions } from "./topic-predictions";

type PatternDashboardProps = {
  examId: string;
};

export function PatternDashboard({ examId }: PatternDashboardProps): React.ReactElement {
  const { data: pattern, isLoading } = trpc.examPattern.getPattern.useQuery(
    { examId },
    { staleTime: 5 * 60_000 },
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!pattern) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center">
          <p>No pattern analysis available for this exam yet.</p>
          <p className="mt-1 text-sm">
            Run pattern analysis after ingesting at least 2 previous year papers.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fingerprint = pattern.fingerprint as {
    subjectWeightage: Array<{
      subject: string;
      averagePercent: number;
      minPercent: number;
      maxPercent: number;
      questionCount: number;
    }>;
    difficultyDistribution: { easy: number; medium: number; hard: number };
    styleDistribution: Array<{ style: string; percent: number }>;
    repeatAnalysis: { overallRepeatRate: number };
    languagePatterns: { negativeQuestionPercent: number; allOfAbovePercent: number };
    structure: { totalQuestions: number; totalMarks: number; durationMinutes: number };
  };

  const confidencePercent = Math.round((pattern.confidence ?? 0) * 100);
  const confidenceColor =
    confidencePercent >= 80
      ? "text-green-600"
      : confidencePercent >= 50
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Exam Pattern Analysis</h3>
          <p className="text-muted-foreground text-sm">
            Based on {pattern.papersAnalyzed} papers
            {pattern.paperYears && Array.isArray(pattern.paperYears)
              ? ` (${(pattern.paperYears as number[])[0]}–${(pattern.paperYears as number[])[(pattern.paperYears as number[]).length - 1]})`
              : ""}
          </p>
        </div>
        <Badge variant="outline" className={confidenceColor}>
          Confidence: {confidencePercent}%
        </Badge>
      </div>

      {/* Structure overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Questions" value={fingerprint.structure.totalQuestions} />
        <StatCard label="Total Marks" value={fingerprint.structure.totalMarks} />
        <StatCard label="Duration" value={`${fingerprint.structure.durationMinutes} min`} />
        <StatCard
          label="Repeat Rate"
          value={`${fingerprint.repeatAnalysis.overallRepeatRate.toFixed(0)}%`}
        />
      </div>

      {/* Subject Weightage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subject Weightage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fingerprint.subjectWeightage
            .sort((a, b) => b.averagePercent - a.averagePercent)
            .map((sw) => (
              <div key={sw.subject} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{sw.subject}</span>
                  <span className="text-muted-foreground">
                    {sw.averagePercent.toFixed(0)}% (~{sw.questionCount} Qs)
                  </span>
                </div>
                <Progress value={sw.averagePercent} className="h-2" />
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Difficulty + Style Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Difficulty */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Difficulty Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DifficultyBar
              label="Easy"
              percent={fingerprint.difficultyDistribution.easy}
              color="bg-green-500"
            />
            <DifficultyBar
              label="Medium"
              percent={fingerprint.difficultyDistribution.medium}
              color="bg-yellow-500"
            />
            <DifficultyBar
              label="Hard"
              percent={fingerprint.difficultyDistribution.hard}
              color="bg-red-500"
            />
          </CardContent>
        </Card>

        {/* Style */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Question Styles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fingerprint.styleDistribution
              .filter((s) => s.percent > 0)
              .sort((a, b) => b.percent - a.percent)
              .slice(0, 8)
              .map((s) => (
                <div key={s.style} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{s.style.replace(/_/g, " ")}</span>
                  <Badge variant="secondary">{s.percent.toFixed(0)}%</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Topic Predictions */}
      <TopicPredictions examId={examId} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DifficultyBar({
  label,
  percent,
  color,
}: {
  label: string;
  percent: number;
  color: string;
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{percent.toFixed(0)}%</span>
      </div>
      <div className="bg-muted h-2 w-full rounded-full">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
