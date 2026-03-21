"use client";

import { useState, useEffect, Suspense } from "react";
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

function VoiceTeacherContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedExamId, setSelectedExamId] = useState("");
  const [topic, setTopic] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);

  const dashboardQuery = trpc.learn.getDashboardData.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });

  // Pre-select from URL params
  useEffect(() => {
    const examIdParam = searchParams.get("examId");
    const topicParam = searchParams.get("topic");
    if (examIdParam && !selectedExamId) setSelectedExamId(examIdParam);
    if (topicParam && !topic) setTopic(topicParam);
  }, [searchParams, selectedExamId, topic]);

  const exams = dashboardQuery.data?.selectedExams ?? [];

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
            <h1 className="text-2xl font-bold">AI Voice Teacher</h1>
            <p className="text-muted-foreground text-sm">
              Conversational tutoring with adaptive difficulty
            </p>
          </div>
        </div>

        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Start a Teacher Session
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
                    Topic <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Drug Metabolism, Pharmacology..."
                  />
                  <p className="text-muted-foreground text-xs">
                    Leave blank to quiz on your weak areas or random topics.
                  </p>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!selectedExamId}
                  onClick={() => setShowOverlay(true)}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  Start AI Teacher Session
                </Button>

                <p className="text-muted-foreground text-center text-xs">
                  Each AI exchange costs 1 credit
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {showOverlay && selectedExamId && (
        <VoiceTutorOverlay
          mode="teacher"
          examId={selectedExamId}
          topic={topic || undefined}
          onClose={() => {
            setShowOverlay(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export default function VoiceTeacherPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <VoiceTeacherContent />
    </Suspense>
  );
}
