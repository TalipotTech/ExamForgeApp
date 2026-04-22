"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export default function CreatorDoubtInboxPage(): React.ReactElement {
  const inboxQuery = trpc.doubt.inbox.useQuery();
  const items = inboxQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/creator">
            <ArrowLeft className="mr-1 size-4" />
            Creator Hub
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Inbox className="size-6" />
          Doubt Inbox
        </h1>
        <p className="text-muted-foreground text-sm">
          Open doubts addressed to you or posted in your classrooms.
        </p>
      </div>

      {inboxQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {inboxQuery.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {inboxQuery.error.message.includes("FEATURE_DISABLED")
              ? "Doubts are not yet enabled."
              : inboxQuery.error.message}
          </CardContent>
        </Card>
      )}

      {!inboxQuery.isLoading && !inboxQuery.error && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageCircle className="text-muted-foreground size-8" />
            <p className="font-medium">No open doubts.</p>
            <p className="text-muted-foreground text-sm">
              When students in your classrooms ask questions, they show up here.
            </p>
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
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {d.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {d.createdAt ? new Date(d.createdAt).toLocaleString("en-IN") : ""}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
