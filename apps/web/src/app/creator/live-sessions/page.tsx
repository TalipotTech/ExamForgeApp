"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeft,
  Plus,
  Radio,
  Calendar,
  Clock,
  ExternalLink,
  MonitorPlay,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

function formatScheduledAt(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string): React.ReactElement {
  if (status === "live") {
    return <Badge className="animate-pulse bg-red-500 text-[10px] text-white">● LIVE</Badge>;
  }
  if (status === "scheduled") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        Scheduled
      </Badge>
    );
  }
  if (status === "ended") {
    return (
      <Badge variant="outline" className="text-[10px]">
        Ended
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      Cancelled
    </Badge>
  );
}

function providerBadge(provider: string | null): React.ReactElement | null {
  if (provider === "zoom") {
    return (
      <Badge
        variant="outline"
        className="border-blue-500/40 text-[10px] text-blue-700 dark:text-blue-400"
      >
        <Video className="mr-0.5 size-3" />
        Zoom
      </Badge>
    );
  }
  if (provider === "100ms") {
    return (
      <Badge
        variant="outline"
        className="border-purple-500/40 text-[10px] text-purple-700 dark:text-purple-400"
      >
        <MonitorPlay className="mr-0.5 size-3" />
        Embedded
      </Badge>
    );
  }
  return null;
}

export default function CreatorLiveSessionsPage(): React.ReactElement {
  const sessionsQuery = trpc.liveSession.myHosted.useQuery();
  const cancelMutation = trpc.liveSession.cancel.useMutation({
    onSuccess: () => {
      toast.success("Session cancelled");
      void sessionsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const { upcoming, past } = useMemo(() => {
    const all = sessionsQuery.data ?? [];
    const upcoming = all.filter((s) => s.status === "scheduled" || s.status === "live");
    const past = all.filter((s) => s.status === "ended" || s.status === "cancelled");
    return { upcoming, past };
  }, [sessionsQuery.data]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/creator">
              <ArrowLeft className="mr-1 size-4" />
              Creator Hub
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radio className="size-6" />
            Live sessions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Schedule a live class with a Google Meet / Teams link, or{" "}
            <Link href="/creator/integrations" className="underline-offset-2 hover:underline">
              connect Zoom
            </Link>{" "}
            to auto-create meetings + auto-record.
          </p>
        </div>
        <Button asChild>
          <Link href="/creator/live-sessions/new">
            <Plus className="mr-1 size-4" />
            Schedule new
          </Link>
        </Button>
      </div>

      {sessionsQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {sessionsQuery.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {sessionsQuery.error.message.includes("FEATURE_DISABLED")
              ? "Live sessions are not yet enabled."
              : sessionsQuery.error.message}
          </CardContent>
        </Card>
      )}

      {!sessionsQuery.isLoading && !sessionsQuery.error && (
        <Tabs defaultValue="upcoming" className="space-y-4">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming · {upcoming.length}</TabsTrigger>
            <TabsTrigger value="past">Past · {past.length}</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Radio className="text-muted-foreground size-8" />
                  <p className="font-medium">No upcoming sessions.</p>
                  <p className="text-muted-foreground text-sm">
                    Schedule one with any meeting link to host a live class.
                  </p>
                  <Button asChild>
                    <Link href="/creator/live-sessions/new">
                      <Plus className="mr-1 size-4" />
                      Schedule new
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              upcoming.map((s) => (
                <Card key={s.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold">{s.title}</h3>
                          {statusBadge(s.status)}
                          {providerBadge(s.meetingProvider)}
                          {!s.isFree && (
                            <Badge variant="outline" className="text-[10px]">
                              ₹{s.priceInr ?? 0}
                            </Badge>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                            {s.description}
                          </p>
                        )}
                        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {formatScheduledAt(s.scheduledAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {s.durationMinutes ?? 60} min
                          </span>
                          {s.classroomId && (
                            <span className="flex items-center gap-1">
                              <Users className="size-3" />
                              Classroom-bound
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {s.meetingUrl && (
                          <Button asChild size="sm" variant="outline">
                            <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1 size-3" />
                              Open meeting
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={cancelMutation.isPending}
                          onClick={() => {
                            if (confirm(`Cancel "${s.title}"?`)) {
                              cancelMutation.mutate({ sessionId: s.id });
                            }
                          }}
                        >
                          <XCircle className="mr-1 size-3" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3">
            {past.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm">
                  No past sessions yet.
                </CardContent>
              </Card>
            ) : (
              past.map((s) => (
                <Card key={s.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold">{s.title}</h3>
                          {statusBadge(s.status)}
                          {providerBadge(s.meetingProvider)}
                        </div>
                        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {formatScheduledAt(s.scheduledAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="size-3" />
                            {s.totalWatchMinutes ?? 0} watch-min
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {s.recordingUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer">
                              <Video className="mr-1 size-3" />
                              Recording
                            </a>
                          </Button>
                        ) : (
                          s.status === "ended" && (
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/creator/live-sessions/${s.id}`}>Add recording</Link>
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
