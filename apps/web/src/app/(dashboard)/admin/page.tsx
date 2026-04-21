"use client";

import { Users, BookOpen, FileText, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

// Quick-access tile grid removed: the left sidebar (see (dashboard)/layout.tsx)
// now exposes every admin destination, so the dashboard tiles were
// duplicate navigation. Stats row stays — that's content, not nav.

export default function AdminOverviewPage(): React.ReactElement {
  const { data: usersData } = trpc.adminUsers.list.useQuery({ page: 1, limit: 1 });
  const { data: ingestStats } = trpc.portalIngestion.getStats.useQuery();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Platform overview and quick access to all admin tools.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{usersData?.total ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Questions</CardTitle>
            <BookOpen className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ingestStats?.approvedQuestions ?? "—"}</p>
            <p className="text-muted-foreground text-xs">
              {ingestStats?.pendingReview ? `${ingestStats.pendingReview} pending review` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ingestStats?.totalDocuments ?? "—"}</p>
            <p className="text-muted-foreground text-xs">
              {ingestStats?.processedDocuments ? `${ingestStats.processedDocuments} processed` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <Activity className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-2xl font-bold">
              {ingestStats?.errorDocuments ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
