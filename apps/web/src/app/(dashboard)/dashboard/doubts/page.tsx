"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function StudentDoubtsPage(): React.ReactElement {
  const doubtsQuery = trpc.doubt.myDoubts.useQuery({ limit: 50 });
  const items = doubtsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageCircle className="size-6" />
          My Doubts
        </h1>
        <p className="text-muted-foreground text-sm">
          Questions you&apos;ve asked and the answers from your teachers.
        </p>
      </div>

      {doubtsQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {doubtsQuery.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {doubtsQuery.error.message.includes("FEATURE_DISABLED")
              ? "Doubts are not yet enabled."
              : doubtsQuery.error.message}
          </CardContent>
        </Card>
      )}

      {!doubtsQuery.isLoading && !doubtsQuery.error && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageCircle className="text-muted-foreground size-8" />
            <p className="font-medium">No doubts yet.</p>
            <p className="text-muted-foreground text-sm">
              Ask a doubt from any classroom you&apos;re enrolled in.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/classrooms">Go to classrooms</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((d) => (
          <Link key={d.id} href={`/dashboard/doubts/${d.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 flex-1 text-sm">{d.questionText}</p>
                  <Badge
                    variant={
                      d.status === "creator_answered" || d.status === "ai_answered"
                        ? "default"
                        : d.status === "closed"
                          ? "secondary"
                          : "outline"
                    }
                    className="shrink-0 text-[10px]"
                  >
                    {d.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN") : ""}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
