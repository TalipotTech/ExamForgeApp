"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Clock, ExternalLink, Lock, Radio, Video } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const JOIN_WINDOW_MS = 5 * 60 * 1000;

function formatScheduledAt(d: Date | string): string {
  return new Date(d).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function useCountdown(target: Date): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "now";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  if (minutes > 5) return `in ${minutes}m`;
  return `in ${minutes}m ${seconds}s`;
}

function UpcomingSessionCard({
  session,
  onJoined,
}: {
  session: {
    id: string;
    title: string;
    description: string | null;
    scheduledAt: Date | string;
    durationMinutes: number | null;
    status: string;
    isFree: boolean | null;
    priceInr: number | null;
    creatorName: string;
    meetingUrl: string | null;
  };
  onJoined: () => void;
}): React.ReactElement {
  const countdown = useCountdown(new Date(session.scheduledAt));
  const startMs = new Date(session.scheduledAt).getTime();
  const isLive = session.status === "live";
  const joinable = isLive || Date.now() >= startMs - JOIN_WINDOW_MS;
  // Track when the student opens the meeting so we can roughly estimate watch
  // time on tab close. Real watch tracking lives inside the meeting provider —
  // this is a best-effort outer-bound number.
  const openedAtRef = useRef<number | null>(null);

  const markJoinedMutation = trpc.liveSession.markJoined.useMutation({
    onSuccess: (res) => {
      onJoined();
      if (res.meetingUrl && typeof window !== "undefined") {
        openedAtRef.current = Date.now();
        window.open(res.meetingUrl, "_blank", "noopener,noreferrer");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Best-effort: when the student closes the tab, tell the server how long
  // they had the meeting open. Not perfectly accurate (no inside-meeting
  // signal) but lets us populate `watch_seconds` for the attendance row.
  const markLeftMutation = trpc.liveSession.markLeft.useMutation();
  useEffect(() => {
    function onUnload(): void {
      const openedAt = openedAtRef.current;
      if (openedAt === null) return;
      const seconds = Math.min(Math.floor((Date.now() - openedAt) / 1000), 24 * 60 * 60);
      // navigator.sendBeacon would be nicer but tRPC mutations don't support
      // it directly; this fires-and-forgets, which is good enough for
      // attendance.
      markLeftMutation.mutate({ sessionId: session.id, watchSeconds: seconds });
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [session.id, markLeftMutation]);

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{session.title}</h3>
              {isLive ? (
                <Badge className="animate-pulse bg-red-500 text-[10px] text-white">● LIVE</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {countdown}
                </Badge>
              )}
              {!session.isFree && (
                <Badge variant="outline" className="text-[10px]">
                  ₹{session.priceInr ?? 0}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">by {session.creatorName}</p>
            {session.description && (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                {session.description}
              </p>
            )}
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {formatScheduledAt(session.scheduledAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {session.durationMinutes ?? 60} min
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {!session.isFree ? (
              <Button size="sm" variant="outline" disabled>
                <Lock className="mr-1 size-3" />
                Paid (coming soon)
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!joinable || markJoinedMutation.isPending}
                onClick={() => markJoinedMutation.mutate({ sessionId: session.id })}
              >
                <ExternalLink className="mr-1 size-3" />
                {isLive ? "Join now" : joinable ? "Join" : "Opens 5 min before"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PastSessionCard({
  session,
}: {
  session: {
    id: string;
    title: string;
    scheduledAt: Date | string;
    status: string;
    creatorName: string;
    recordingUrl: string | null;
  };
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{session.title}</h3>
              {session.status === "cancelled" ? (
                <Badge variant="destructive" className="text-[10px]">
                  Cancelled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Ended
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {formatScheduledAt(session.scheduledAt)} · by {session.creatorName}
            </p>
          </div>
          {session.recordingUrl && session.status === "ended" ? (
            <Button asChild size="sm" variant="outline">
              <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer">
                <Video className="mr-1 size-3" />
                Watch recording
              </a>
            </Button>
          ) : (
            session.status === "ended" && (
              <span className="text-muted-foreground text-xs">No recording</span>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ClassroomLiveSessions({
  classroomId,
  emptyMessage,
}: {
  classroomId?: string;
  emptyMessage?: { title: string; subtitle: string };
}): React.ReactElement {
  // Passing `undefined` to useQuery is fine — the router treats no classroomId
  // as "all sessions I can access" (standalone + member-of + caller-hosted).
  const queryInput = classroomId ? { classroomId } : undefined;
  const upcomingQuery = trpc.liveSession.listUpcoming.useQuery(queryInput);
  const pastQuery = trpc.liveSession.listPast.useQuery(queryInput);

  const upcoming = upcomingQuery.data ?? [];
  const past = pastQuery.data ?? [];

  if (upcomingQuery.isLoading || pastQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (upcomingQuery.error?.message.includes("FEATURE_DISABLED")) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm">
          Live sessions are not yet enabled.
        </CardContent>
      </Card>
    );
  }

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">
          <Radio className="text-muted-foreground mx-auto mb-2 size-6" />
          <p className="font-medium">{emptyMessage?.title ?? "No live sessions yet."}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {emptyMessage?.subtitle ??
              (classroomId
                ? "Your teacher will schedule live sessions here."
                : "Sessions you're invited to or that creators schedule will show up here.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Upcoming</h3>
          {upcoming.map((s) => (
            <UpcomingSessionCard
              key={s.id}
              session={{
                id: s.id,
                title: s.title,
                description: s.description ?? null,
                scheduledAt: s.scheduledAt,
                durationMinutes: s.durationMinutes ?? 60,
                status: s.status,
                isFree: s.isFree ?? true,
                priceInr: s.priceInr ?? null,
                creatorName: s.creatorName,
                meetingUrl: s.meetingUrl ?? null,
              }}
              onJoined={() => {
                void upcomingQuery.refetch();
              }}
            />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Past</h3>
          {past.map((s) => (
            <PastSessionCard
              key={s.id}
              session={{
                id: s.id,
                title: s.title,
                scheduledAt: s.scheduledAt,
                status: s.status,
                creatorName: s.creatorName,
                recordingUrl: s.recordingUrl ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
