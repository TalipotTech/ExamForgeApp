"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, Calendar, Clock, ExternalLink, Radio, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

function formatScheduledAt(d: Date | string): string {
  return new Date(d).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function CreatorLiveSessionDetailPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);
  const sessionQuery = trpc.liveSession.byId.useQuery({ sessionId: id });
  const attendeesQuery = trpc.liveSession.listAttendees.useQuery({ sessionId: id });

  const [recordingUrl, setRecordingUrl] = useState("");
  const setRecordingMutation = trpc.liveSession.setRecordingUrl.useMutation({
    onSuccess: () => {
      toast.success("Recording URL saved");
      setRecordingUrl("");
      void sessionQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {sessionQuery.error?.message ?? "Session not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { session, creator, attendeeCount, isHost } = sessionQuery.data;
  const attendees = attendeesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/creator/live-sessions">
          <ArrowLeft className="mr-1 size-4" />
          Live sessions
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radio className="size-6" />
            {session.title}
          </h1>
          {session.status === "live" && (
            <Badge className="animate-pulse bg-red-500 text-white">● LIVE</Badge>
          )}
          {session.status === "scheduled" && <Badge variant="secondary">Scheduled</Badge>}
          {session.status === "ended" && <Badge variant="outline">Ended</Badge>}
          {session.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
        </div>
        {session.description && (
          <p className="text-muted-foreground mt-1 text-sm">{session.description}</p>
        )}
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {formatScheduledAt(session.scheduledAt)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {session.durationMinutes ?? 60} min
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            {attendeeCount} attendee{attendeeCount === 1 ? "" : "s"}
          </span>
          {creator && <span>by {creator.displayName}</span>}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Meeting link</h2>
            {session.meetingUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 size-3" />
                  Open
                </a>
              </Button>
            )}
          </div>
          <p className="text-muted-foreground break-all text-xs">{session.meetingUrl}</p>
        </CardContent>
      </Card>

      {isHost && (session.status === "ended" || session.status === "live") && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-semibold">Recording</h2>
            {session.recordingUrl ? (
              <div className="flex items-center justify-between gap-2">
                <a
                  href={session.recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline"
                >
                  <Video className="mr-1 inline size-3" />
                  {session.recordingUrl}
                </a>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No recording uploaded yet.</p>
            )}
            <div className="space-y-2 pt-1">
              <Label htmlFor="recording" className="text-xs">
                Paste the recording URL (Google Drive, S3, YouTube unlisted…)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="recording"
                  type="url"
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                  placeholder="https://…"
                />
                <Button
                  size="sm"
                  disabled={!recordingUrl.startsWith("https://") || setRecordingMutation.isPending}
                  onClick={() =>
                    setRecordingMutation.mutate({
                      sessionId: id,
                      recordingUrl: recordingUrl.trim(),
                    })
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-semibold">Attendees ({attendees.length})</h2>
          {attendees.length === 0 ? (
            <p className="text-muted-foreground text-sm">No attendees yet.</p>
          ) : (
            <div className="space-y-2">
              {attendees.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{a.studentName}</div>
                    <div className="text-muted-foreground text-xs">{a.studentEmail}</div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatDuration(a.watchSeconds ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
