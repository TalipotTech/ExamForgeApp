"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Play } from "lucide-react";

export default function ExamStartPage(): React.ReactElement {
  const router = useRouter();
  const { data: filters, isLoading: filtersLoading } =
    trpc.question.filters.useQuery();

  const startMutation = trpc.examSession.start.useMutation({
    onSuccess: (data) => {
      router.push(`/take/${data.sessionId}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [examId, setExamId] = useState("");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(
    undefined,
  );

  function handleStart(e: React.FormEvent): void {
    e.preventDefault();
    if (!examId) {
      toast.error("Please select an exam");
      return;
    }
    startMutation.mutate({
      examId,
      totalQuestions,
      durationMinutes: durationMinutes || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Start an Exam</h1>
        <p className="text-muted-foreground">
          Configure and begin a practice exam session.
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Exam Configuration</CardTitle>
          <CardDescription>
            Select your exam and set the number of questions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStart} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="exam">Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger id="exam">
                  <SelectValue
                    placeholder={
                      filtersLoading ? "Loading exams..." : "Select an exam"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filters?.exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="totalQuestions">Number of Questions</Label>
              <Input
                id="totalQuestions"
                type="number"
                min={1}
                max={200}
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Between 1 and 200 questions
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">
                Time Limit (minutes){" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="duration"
                type="number"
                min={1}
                max={360}
                placeholder="Auto: 1.5 min per question"
                value={durationMinutes ?? ""}
                onChange={(e) =>
                  setDurationMinutes(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </div>

            <Button
              type="submit"
              disabled={startMutation.isPending || !examId}
              className="w-full"
            >
              <Play className="size-4" />
              {startMutation.isPending ? "Starting..." : "Start Exam"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
