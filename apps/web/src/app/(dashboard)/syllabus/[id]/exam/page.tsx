"use client";

import { useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckSquare, Clock, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function ExamBuilderContent(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const syllabusId = params.id as string;

  const nodeIdsParam = searchParams.get("nodes") ?? "";
  const nodeIds = nodeIdsParam.split(",").filter(Boolean).map(Number);

  const [questionCount, setQuestionCount] = useState(20);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [easyPct, setEasyPct] = useState(30);
  const [mediumPct, setMediumPct] = useState(50);
  const [hardPct, setHardPct] = useState(20);

  const treeQuery = trpc.syllabus.getTree.useQuery({
    syllabusId: Number(syllabusId),
  });

  const createExam = trpc.syllabus.createExamFromNodes.useMutation({
    onSuccess: (data) => {
      toast.success(`Exam created with ${data.questionCount} questions!`);
      router.push(`/take/${data.sessionId}` as "/");
    },
    onError: (err) => toast.error(err.message),
  });

  // Get selected node info
  const selectedNodes = treeQuery.data?.nodes.filter((n) => nodeIds.includes(n.id)) ?? [];

  const totalMcqs = selectedNodes.reduce((sum, n) => sum + (n.mcqCount ?? 0), 0);

  function handleDifficultyChange(type: "easy" | "medium" | "hard", value: number): void {
    const remaining = 100 - value;
    if (type === "easy") {
      setEasyPct(value);
      const ratio = mediumPct + hardPct > 0 ? mediumPct / (mediumPct + hardPct) : 0.5;
      setMediumPct(Math.round(remaining * ratio));
      setHardPct(remaining - Math.round(remaining * ratio));
    } else if (type === "medium") {
      setMediumPct(value);
      const ratio = easyPct + hardPct > 0 ? easyPct / (easyPct + hardPct) : 0.5;
      setEasyPct(Math.round(remaining * ratio));
      setHardPct(remaining - Math.round(remaining * ratio));
    } else {
      setHardPct(value);
      const ratio = easyPct + mediumPct > 0 ? easyPct / (easyPct + mediumPct) : 0.5;
      setEasyPct(Math.round(remaining * ratio));
      setMediumPct(remaining - Math.round(remaining * ratio));
    }
  }

  if (nodeIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            No nodes selected. Go back and select nodes from the syllabus tree.
            <br />
            <Link href={`/syllabus/${syllabusId}` as "/"}>
              <Button variant="link">Back to syllabus</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (treeQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link href={`/syllabus/${syllabusId}` as "/"}>
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to tree
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Create Exam</h1>
        <p className="text-muted-foreground text-sm">Build an exam from selected syllabus nodes</p>
      </div>

      {/* Selected Nodes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4" />
            Selected Topics ({selectedNodes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {selectedNodes.map((n) => (
              <div key={n.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{n.title}</span>
                <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                  {n.mcqCount ?? 0} MCQs
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t pt-3 text-sm font-medium">
            Total available: {totalMcqs} MCQs
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Exam Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Question Count */}
          <div className="space-y-2">
            <Label>Number of Questions</Label>
            <Input
              type="number"
              min={5}
              max={Math.min(200, totalMcqs)}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value) || 5)}
            />
            {totalMcqs > 0 && questionCount > totalMcqs && (
              <p className="text-xs text-red-500">Only {totalMcqs} questions available</p>
            )}
          </div>

          {/* Time Limit */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Time Limit (minutes)
            </Label>
            <Input
              type="number"
              min={5}
              max={300}
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value) || 30)}
            />
          </div>

          {/* Difficulty Mix */}
          <div className="space-y-3">
            <Label>Difficulty Distribution</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-16 text-sm text-green-600">Easy</span>
                <Slider
                  value={[easyPct]}
                  onValueChange={([v]) => handleDifficultyChange("easy", v!)}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="w-10 text-right text-sm">{easyPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-sm text-yellow-600">Medium</span>
                <Slider
                  value={[mediumPct]}
                  onValueChange={([v]) => handleDifficultyChange("medium", v!)}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="w-10 text-right text-sm">{mediumPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-sm text-red-600">Hard</span>
                <Slider
                  value={[hardPct]}
                  onValueChange={([v]) => handleDifficultyChange("hard", v!)}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="w-10 text-right text-sm">{hardPct}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Start Button */}
      <Button
        className="w-full"
        size="lg"
        disabled={createExam.isPending || totalMcqs === 0 || questionCount > totalMcqs}
        onClick={() =>
          createExam.mutate({
            nodeIds,
            questionCount: Math.min(questionCount, totalMcqs),
            timeLimitMinutes,
            difficultyMix: {
              easy: easyPct,
              medium: mediumPct,
              hard: hardPct,
            },
          })
        }
      >
        {createExam.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Play className="mr-2 h-4 w-4" />
        )}
        Start Exam
      </Button>
    </div>
  );
}

export default function ExamBuilderPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <ExamBuilderContent />
    </Suspense>
  );
}
