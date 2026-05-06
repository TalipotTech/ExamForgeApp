"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  ExternalLink,
  Lock,
  Radio,
  Video,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const JOIN_WINDOW_MS = 5 * 60 * 1000;

type SessionStatus = "scheduled" | "live" | "ended" | "cancelled";

type Session = {
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
  recordingUrl: string | null;
};

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

/**
 * Status-driven visual treatment. Border-left accent + matching badge so
 * the four states are instantly distinguishable in a mixed list:
 *   live      → red, pulsing dot
 *   scheduled → blue, countdown text
 *   ended     → muted gray
 *   cancelled → red-muted, strikethrough title
 */
function statusStyles(status: SessionStatus): {
  border: string;
  badge: React.ReactElement;
  titleClass: string;
} {
  switch (status) {
    case "live":
      return {
        border: "border-l-4 border-l-red-500",
        badge: <Badge className="animate-pulse bg-red-500 text-[10px] text-white">● LIVE</Badge>,
        titleClass: "",
      };
    case "scheduled":
      return {
        border: "border-l-4 border-l-blue-500",
        badge: <></>, // countdown rendered separately
        titleClass: "",
      };
    case "ended":
      return {
        border: "border-l-4 border-l-muted-foreground/30",
        badge: (
          <Badge variant="outline" className="text-[10px]">
            <CheckCircle2 className="mr-1 size-2.5" />
            Ended
          </Badge>
        ),
        titleClass: "text-muted-foreground",
      };
    case "cancelled":
      return {
        border: "border-l-4 border-l-destructive/50",
        badge: (
          <Badge variant="destructive" className="text-[10px]">
            <XCircle className="mr-1 size-2.5" />
            Cancelled
          </Badge>
        ),
        titleClass: "text-muted-foreground line-through",
      };
  }
}

function SessionCard({
  session,
  onJoined,
}: {
  session: Session;
  onJoined: () => void;
}): React.ReactElement {
  const status = (session.status as SessionStatus) ?? "scheduled";
  const styles = statusStyles(status);
  const startMs = new Date(session.scheduledAt).getTime();
  const isLive = status === "live";
  const isScheduled = status === "scheduled";
  const isEnded = status === "ended";
  const isCancelled = status === "cancelled";
  const joinable = isLive || (isScheduled && Date.now() >= startMs - JOIN_WINDOW_MS);
  const countdown = useCountdown(new Date(session.scheduledAt));

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

  // Best-effort outer-bound watch tracking — fires when student closes the
  // tab. Real watch time would come from inside the meeting provider.
  const markLeftMutation = trpc.liveSession.markLeft.useMutation();
  useEffect(() => {
    if (!isLive && !isScheduled) return;
    function onUnload(): void {
      const openedAt = openedAtRef.current;
      if (openedAt === null) return;
      const seconds = Math.min(Math.floor((Date.now() - openedAt) / 1000), 24 * 60 * 60);
      markLeftMutation.mutate({ sessionId: session.id, watchSeconds: seconds });
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [session.id, isLive, isScheduled, markLeftMutation]);

  return (
    <Card className={styles.border}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`truncate font-semibold ${styles.titleClass}`}>{session.title}</h3>
              {isScheduled ? (
                <Badge variant="secondary" className="text-[10px]">
                  {countdown}
                </Badge>
              ) : (
                styles.badge
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
            {(isLive || isScheduled) &&
              (!session.isFree ? (
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
              ))}
            {isEnded &&
              (session.recordingUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer">
                    <Video className="mr-1 size-3" />
                    Watch recording
                  </a>
                </Button>
              ) : (
                <span className="text-muted-foreground text-xs">No recording</span>
              ))}
            {isCancelled && (
              <span className="text-muted-foreground text-xs">Session cancelled</span>
            )}
          </div>
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

  function toCardSession(s: {
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
    recordingUrl: string | null;
  }): Session {
    return {
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
      recordingUrl: s.recordingUrl ?? null,
    };
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

  function refetchAll(): void {
    void upcomingQuery.refetch();
    void pastQuery.refetch();
  }

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Upcoming</h3>
            <Badge variant="outline" className="text-[10px]">
              {upcoming.length}
            </Badge>
          </div>
          {upcoming.map((s) => (
            <SessionCard key={s.id} session={toCardSession(s)} onJoined={refetchAll} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">History</h3>
            <Badge variant="outline" className="text-[10px]">
              {past.length}
            </Badge>
          </div>
          {past.map((s) => (
            <SessionCard key={s.id} session={toCardSession(s)} onJoined={refetchAll} />
          ))}
        </div>
      )}
    </div>
  );
}
