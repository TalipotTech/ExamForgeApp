"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { VoiceTutorOverlay } from "@/components/voice-tutor/voice-tutor-overlay";

function VoiceExamContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedExamId, setSelectedExamId] = useState("");
  const [subject, setSubject] = useState("");
  const [questionCount, setQuestionCount] = useState("10");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [showOverlay, setShowOverlay] = useState(false);

  const dashboardQuery = trpc.learn.getDashboardData.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });

  const exams = dashboardQuery.data?.selectedExams ?? [];

  // Pre-select exam from URL params
  useEffect(() => {
    const examIdParam = searchParams.get("examId");
    if (examIdParam && !selectedExamId) {
      setSelectedExamId(examIdParam);
    }
  }, [searchParams, selectedExamId]);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Voice Exam</h1>
            <p className="text-muted-foreground text-sm">
              Take a practice exam with voice interaction
            </p>
          </div>
        </div>

        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Configure Voice Exam
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboardQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : exams.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No exams selected. Add an examination from your dashboard first.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Examination</Label>
                  <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an examination" />
                    </SelectTrigger>
                    <SelectContent>
                      {exams.map((exam) => (
                        <SelectItem key={exam.examId} value={exam.examId}>
                          {exam.examName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Subject <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Pharmacology, Biochemistry..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Questions</Label>
                    <Select value={questionCount} onValueChange={setQuestionCount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="30">30</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select
                      value={difficulty}
                      onValueChange={(v) =>
                        setDifficulty(v as "easy" | "medium" | "hard" | "mixed")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Mixed</SelectItem>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!selectedExamId}
                  onClick={() => setShowOverlay(true)}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  Start Voice Exam
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {showOverlay && selectedExamId && (
        <VoiceTutorOverlay
          mode="fresh_exam"
          examId={selectedExamId}
          subject={subject || undefined}
          questionCount={parseInt(questionCount)}
          difficulty={difficulty}
          onClose={() => {
            setShowOverlay(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export default function VoiceExamPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <VoiceExamContent />
    </Suspense>
  );
}
