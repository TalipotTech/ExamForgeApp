"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mic, Clock, Target, Loader2 } from "lucide-react";
import Link from "next/link";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function VoiceHistoryPage(): React.ReactElement {
  const sessionsQuery = trpc.voiceTutor.listSessions.useQuery({ limit: 50 }, { staleTime: 30_000 });

  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Voice Session History</h1>
          <p className="text-muted-foreground text-sm">Your past voice tutor sessions</p>
        </div>
      </div>

      {sessionsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Mic className="text-muted-foreground h-10 w-10" />
            <p className="font-medium">No voice sessions yet</p>
            <p className="text-muted-foreground text-sm">
              Start a voice exam or teacher session to see your history here.
            </p>
            <div className="mt-2 flex gap-2">
              <Link href="/dashboard/voice-exam">
                <Button variant="outline" size="sm">
                  Voice Exam
                </Button>
              </Link>
              <Link href="/dashboard/voice-teacher">
                <Button variant="outline" size="sm">
                  AI Teacher
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 rounded-lg p-2">
                    <Mic className="text-primary h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium capitalize">{session.mode.replace("_", " ")}</p>
                      <Badge
                        variant={
                          session.status === "completed"
                            ? "default"
                            : session.status === "active"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {session.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(session.startedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {session.correctCount ?? 0}/{session.totalQuestions ?? 0} correct
                      </span>
                      {session.durationSeconds && (
                        <span>{formatDuration(session.durationSeconds)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {session.scorePercent !== null && (
                  <Badge
                    variant={
                      session.scorePercent >= 80
                        ? "default"
                        : session.scorePercent >= 50
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {Math.round(session.scorePercent)}%
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
