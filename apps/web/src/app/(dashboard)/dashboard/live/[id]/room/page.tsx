/**
 * /dashboard/live/[id]/room — embedded video room (Option C / 100ms).
 *
 * Thin shell page: just unwraps the dynamic route param and hands it to
 * the client component. Lives under (dashboard) so the topbar+sidebar
 * stay mounted (Discord-style "I'm in a call but still navigating the
 * app" UX is intentionally NOT a goal here — the room is the focus).
 *
 * Manual / Zoom sessions never reach this route — the student card opens
 * those in a new tab. The page renders a friendly redirect prompt for any
 * session that's not actually a 100ms one.
 */

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HMSRoom } from "./HMSRoom";

export default async function LiveSessionRoomPage(props: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await props.params;
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <HMSRoom sessionId={id} />
    </Suspense>
  );
}
