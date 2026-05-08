"use client";

/**
 * Embedded 100ms room. Stays minimal on purpose:
 *   - Mic / camera toggles
 *   - Active-speaker grid (no chat / screen-share / hand-raise yet — those
 *     are follow-up slices, see LIVE_SESSIONS_OPTION_C_EMBEDDED.md §"In-room UX")
 *   - Leave button → fires markLeft + routes back
 *
 * The `<HMSRoomProvider>` wrapper supplies the SDK store + actions to all
 * descendants. We auto-join once we have a token; the join itself is the
 * only thing that needs the user-name, role gates, and recording opt-in
 * carry over from the server-issued token.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Radio,
  Users,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  HMSRoomProvider,
  selectIsConnectedToRoom,
  selectIsLocalAudioEnabled,
  selectIsLocalVideoEnabled,
  selectIsPeerVideoEnabled,
  selectLocalPeer,
  selectPeers,
  useHMSActions,
  useHMSStore,
  useVideo,
  type HMSPeer,
} from "@100mslive/react-sdk";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export function HMSRoom({ sessionId }: { sessionId: string }): React.ReactElement {
  return (
    <HMSRoomProvider>
      <HMSRoomInner sessionId={sessionId} />
    </HMSRoomProvider>
  );
}

function HMSRoomInner({ sessionId }: { sessionId: string }): React.ReactElement {
  const router = useRouter();
  const { data: session } = useSession();
  const sessionQuery = trpc.liveSession.byId.useQuery({ sessionId });
  const getJoinToken = trpc.liveSession.getJoinToken.useMutation();
  const markLeft = trpc.liveSession.markLeft.useMutation();
  const hmsActions = useHMSActions();
  const isConnected = useHMSStore(selectIsConnectedToRoom);
  const peers = useHMSStore(selectPeers);
  const localPeer = useHMSStore(selectLocalPeer);
  const isAudioOn = useHMSStore(selectIsLocalAudioEnabled);
  const isVideoOn = useHMSStore(selectIsLocalVideoEnabled);

  const [joinError, setJoinError] = useState<string | null>(null);
  const joinedAtRef = useRef<number | null>(null);

  // Single-shot join. Strict-Mode-safe via the ref guard so we don't
  // double-subscribe on the dev-server's intentional double mount.
  const joinKickedOff = useRef(false);
  useEffect(() => {
    if (joinKickedOff.current) return;
    if (!session?.user?.id || !sessionQuery.data) return;
    if (sessionQuery.data.session.meetingProvider !== "100ms") {
      setJoinError("This session does not use embedded video.");
      return;
    }
    joinKickedOff.current = true;
    (async () => {
      try {
        const { token } = await getJoinToken.mutateAsync({ sessionId });
        joinedAtRef.current = Date.now();
        await hmsActions.join({
          userName: session.user?.name ?? "Guest",
          authToken: token,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to join";
        setJoinError(msg);
        toast.error(msg);
      }
    })();
    // We deliberately depend only on the bits we read at the start —
    // `hmsActions` and the mutation hook are stable across renders.
  }, [session?.user?.id, sessionQuery.data, sessionId]);

  // Hard-leave on unmount so a back-button or page swap actually drops the
  // peer instead of leaving them ghosted in the room until the SDK times
  // out. Also flushes a watch-time estimate to the server.
  useEffect(() => {
    return () => {
      if (joinedAtRef.current !== null) {
        const seconds = Math.min(
          Math.floor((Date.now() - joinedAtRef.current) / 1000),
          24 * 60 * 60,
        );
        markLeft.mutate({ sessionId, watchSeconds: seconds });
      }
      void hmsActions.leave().catch(() => {
        // best-effort; SDK throws if not joined yet
      });
    };
  }, [sessionId]);

  async function handleLeave(): Promise<void> {
    if (joinedAtRef.current !== null) {
      const seconds = Math.min(Math.floor((Date.now() - joinedAtRef.current) / 1000), 24 * 60 * 60);
      await markLeft.mutateAsync({ sessionId, watchSeconds: seconds }).catch(() => {});
      joinedAtRef.current = null;
    }
    await hmsActions.leave();
    router.push("/dashboard/live");
  }

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">
          {sessionQuery.error?.message ?? "Session not found."}
        </CardContent>
      </Card>
    );
  }

  const { session: liveSession, isHost } = sessionQuery.data;

  if (joinError) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-destructive text-sm font-medium">{joinError}</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard/live">
              <ArrowLeft className="mr-1 size-4" />
              Back to live sessions
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/dashboard/live">
              <ArrowLeft className="mr-1 size-4" />
              Back
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Radio className="size-5" />
            {liveSession.title}
            {isConnected && (
              <Badge className="animate-pulse bg-red-500 text-[10px] text-white">● LIVE</Badge>
            )}
            {isHost && (
              <Badge variant="outline" className="text-[10px]">
                Host
              </Badge>
            )}
          </h1>
        </div>
        <Badge variant="outline" className="gap-1">
          <Users className="size-3" />
          {peers.length}
        </Badge>
      </div>

      {!isConnected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Joining room…</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {peers.map((peer) => (
              <PeerTile key={peer.id} peer={peer} isSelf={peer.id === localPeer?.id} />
            ))}
          </div>
          <div className="bg-card sticky bottom-4 mx-auto flex w-fit items-center gap-2 rounded-full border p-2 shadow">
            <Button
              size="icon"
              variant={isAudioOn ? "default" : "destructive"}
              onClick={() => hmsActions.setLocalAudioEnabled(!isAudioOn)}
              title={isAudioOn ? "Mute" : "Unmute"}
            >
              {isAudioOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant={isVideoOn ? "default" : "destructive"}
              onClick={() => hmsActions.setLocalVideoEnabled(!isVideoOn)}
              title={isVideoOn ? "Stop camera" : "Start camera"}
            >
              {isVideoOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
            </Button>
            <Button variant="destructive" onClick={handleLeave}>
              <LogOut className="mr-1 size-4" />
              Leave
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PeerTile({ peer, isSelf }: { peer: HMSPeer; isSelf: boolean }): React.ReactElement {
  // The `useVideo` hook attaches the video track for this peer to the
  // <video> element via the returned ref. Mirror own video so it feels
  // natural; remote peers render normally.
  const { videoRef } = useVideo({ trackId: peer.videoTrack });
  const isVideoEnabled = useHMSStore(selectIsPeerVideoEnabled(peer.id));
  const hasVideo = Boolean(peer.videoTrack) && isVideoEnabled;

  return (
    <Card className="overflow-hidden">
      <div className="bg-muted relative aspect-video w-full">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted={isSelf}
            playsInline
            className={`size-full object-cover ${isSelf ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <div className="bg-primary/20 text-primary flex size-16 items-center justify-center rounded-full text-lg font-semibold">
              {(peer.name ?? "?").slice(0, 1).toUpperCase()}
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {peer.name ?? "Unknown"}
            {isSelf ? " (you)" : ""}
          </Badge>
          {peer.roleName === "creator" && (
            <Badge className="bg-amber-500 text-[10px] text-white">Host</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
