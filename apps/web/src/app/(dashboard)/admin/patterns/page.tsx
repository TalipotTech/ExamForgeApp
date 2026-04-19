"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, Settings } from "lucide-react";

export default function AdminPatternsPage(): React.ReactElement {
  const { data: examList, isLoading } = trpc.exam.listForAdmin.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="size-6" />
          Pattern Analysis
        </h1>
        <p className="text-muted-foreground">
          Manage exam pattern analysis across all exams. Requires at least 2 previous year papers
          per exam for reliable fingerprinting.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exams</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !examList || examList.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No exams yet. Ingest papers via the scraper/ingest pipeline first.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Conducting Body</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examList.map((exam) => (
                  <ExamPatternRow
                    key={exam.id}
                    id={exam.id}
                    name={exam.name}
                    category={exam.category ?? null}
                    conductingBody={exam.conductingBody ?? null}
                    questionCount={exam.questionCount ?? 0}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExamPatternRow({
  id,
  name,
  category,
  conductingBody,
  questionCount,
}: {
  id: string;
  name: string;
  category: string | null;
  conductingBody: string | null;
  questionCount: number;
}): React.ReactElement {
  const { data: status } = trpc.examPattern.getClassificationStatus.useQuery(
    { examId: id },
    { staleTime: 60_000 },
  );
  const { data: pattern } = trpc.examPattern.getPattern.useQuery(
    { examId: id },
    { staleTime: 60_000 },
  );

  const classifiedPapers = status?.classifiedPapers ?? 0;
  const totalPapers = status?.totalPapers ?? 0;
  const hasPattern = Boolean(pattern);

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground text-xs">
            {hasPattern ? (
              <Badge variant="outline" className="text-green-600">
                Pattern v{pattern?.version ?? 1} · {pattern?.papersAnalyzed ?? 0} papers
              </Badge>
            ) : totalPapers > 0 ? (
              <Badge variant="secondary">
                {classifiedPapers}/{totalPapers} classified
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                No papers ingested
              </Badge>
            )}
          </span>
        </div>
      </TableCell>
      <TableCell>{category ?? "-"}</TableCell>
      <TableCell>{questionCount}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{conductingBody ?? "-"}</TableCell>
      <TableCell className="text-right">
        <Link href={`/dashboard/exam/${id}/patterns` as "/"}>
          <Button variant="outline" size="sm">
            <Settings className="size-3.5" />
            Manage
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
