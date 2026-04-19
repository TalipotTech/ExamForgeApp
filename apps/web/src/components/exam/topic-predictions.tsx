"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TopicPredictionsProps = {
  examId: string;
  topN?: number;
};

const IMPORTANCE_COLORS: Record<string, string> = {
  must_study: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-800",
};

export function TopicPredictions({ examId, topN = 20 }: TopicPredictionsProps): React.ReactElement {
  const { data, isLoading } = trpc.examPattern.getTopicPredictions.useQuery(
    { examId, topN },
    { staleTime: 5 * 60_000 },
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.predictions.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-center text-sm">
          No topic predictions available. Run pattern analysis first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Predicted Topics for Next Exam</CardTitle>
        {data.papersAnalyzed > 0 && (
          <p className="text-muted-foreground text-xs">
            Based on {data.papersAnalyzed} papers analyzed
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.predictions.map((prediction, index) => (
            <div
              key={`${prediction.subject}-${prediction.topic}`}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-5 text-sm font-medium">{index + 1}.</span>
                <div>
                  <p className="text-sm font-medium">{prediction.topic}</p>
                  <p className="text-muted-foreground text-xs">{prediction.subject}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {prediction.appearsInPercent.toFixed(0)}% of papers
                </span>
                <Badge
                  variant="secondary"
                  className={IMPORTANCE_COLORS[prediction.importance] ?? IMPORTANCE_COLORS.low}
                >
                  {prediction.importance === "must_study"
                    ? "Must Study"
                    : prediction.importance.charAt(0).toUpperCase() +
                      prediction.importance.slice(1)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
