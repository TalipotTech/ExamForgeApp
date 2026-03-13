"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, FileText, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  uploading: "bg-yellow-500",
  processing: "bg-blue-500",
  parsed: "bg-green-500",
  error: "bg-red-500",
};

export default function SyllabusListPage(): React.ReactElement {
  const [examId, setExamId] = useState<string>("");

  const examsQuery = trpc.exam.listPublic.useQuery({});
  const syllabusQuery = trpc.syllabus.list.useQuery({ examId }, { enabled: !!examId });

  const examOptions = examsQuery.data?.exams ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Syllabus</h1>
          <p className="text-muted-foreground text-sm">
            Upload and manage exam syllabi for AI-powered learning
          </p>
        </div>
        <Link href={"/syllabus/upload" as "/"}>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Syllabus
          </Button>
        </Link>
      </div>

      <div className="max-w-xs">
        <Select value={examId} onValueChange={setExamId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an exam" />
          </SelectTrigger>
          <SelectContent>
            {examOptions.map((e: { id: string; name: string }) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!examId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="text-muted-foreground mb-4 h-12 w-12" />
            <p className="text-muted-foreground">Select an exam above to view its syllabi</p>
          </CardContent>
        </Card>
      )}

      {examId && syllabusQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {examId && syllabusQuery.data && syllabusQuery.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="text-muted-foreground mb-4 h-12 w-12" />
            <p className="text-muted-foreground mb-4">No syllabi uploaded for this exam yet</p>
            <Link href={"/syllabus/upload" as "/"}>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Upload First Syllabus
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {examId && syllabusQuery.data && syllabusQuery.data.length > 0 && (
        <div className="space-y-3">
          {syllabusQuery.data.map((s) => (
            <Link key={s.id} href={`/syllabus/${s.id}` as "/"}>
              <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                <CardContent className="flex items-center gap-4 p-4">
                  <FileText className="text-muted-foreground h-8 w-8 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {s.pageCount ? `${s.pageCount} pages` : "Processing..."} &middot;{" "}
                      {new Date(s.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 capitalize">
                    <span
                      className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STATUS_COLORS[s.status ?? ""] ?? "bg-gray-400"}`}
                    />
                    {s.status}
                  </Badge>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
