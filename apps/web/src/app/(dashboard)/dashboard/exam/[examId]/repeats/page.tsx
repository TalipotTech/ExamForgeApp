"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export default function RepeatCandidatesPage(): React.ReactElement {
  const params = useParams();
  const examId = params.examId as string;

  const { data, isLoading } = trpc.examPattern.getRepeatCandidates.useQuery(
    { examId, limit: 50 },
    { staleTime: 5 * 60_000 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Most Likely to Repeat</h1>
        <p className="text-muted-foreground">
          Questions that have appeared across multiple years, grouped by topic
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !data || data.candidates.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            <p>No repeat candidates found.</p>
            <p className="mt-1 text-sm">
              Run pattern analysis with at least 2 papers to detect repeats.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {data.totalRepeated} repeated questions found across all papers
          </p>

          <div className="space-y-3">
            {data.candidates.map((group) => (
              <Collapsible key={group.topic}>
                <Card>
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="text-left">
                        <CardTitle className="text-sm font-medium">{group.topic}</CardTitle>
                        <p className="text-muted-foreground text-xs">{group.subject}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{group.repeatCount} repeated</Badge>
                        <ChevronDown className="text-muted-foreground h-4 w-4" />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {group.questions.map((q) => {
                          const content = q.content as {
                            question?: string;
                            options?: string[];
                          };
                          const repeatedFrom = q.repeatedFrom as
                            | Array<{
                                year: number;
                                paperNumber?: string;
                              }>
                            | undefined;

                          return (
                            <div key={q.id} className="space-y-2 rounded-md border p-3">
                              <p className="text-sm">
                                {content?.question ?? "Question text unavailable"}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {q.paperYear && (
                                  <Badge variant="outline" className="text-xs">
                                    {q.paperYear}
                                    {q.paperNumber ? ` ${q.paperNumber}` : ""}
                                  </Badge>
                                )}
                                {repeatedFrom?.map((r, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {r.year}
                                    {r.paperNumber ? ` ${r.paperNumber}` : ""}
                                  </Badge>
                                ))}
                                {q.patternTags &&
                                  (q.patternTags as string[]).map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                      {tag.replace(/_/g, " ")}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
