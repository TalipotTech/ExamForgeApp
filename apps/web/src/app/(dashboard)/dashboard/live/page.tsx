"use client";

import { Radio } from "lucide-react";
import { ClassroomLiveSessions } from "@/components/classroom/classroom-live-sessions";

export default function LiveSessionsPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Radio className="size-6" />
          Live sessions
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Open public live classes plus any sessions scheduled in the classrooms you&apos;ve joined.
          Click a session to join when the host opens it.
        </p>
      </div>

      <ClassroomLiveSessions
        emptyMessage={{
          title: "No live sessions right now.",
          subtitle: "Public sessions and your classroom sessions will show up here.",
        }}
      />
    </div>
  );
}
