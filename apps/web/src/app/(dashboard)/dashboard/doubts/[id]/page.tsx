"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, MessageCircle, Bot, Send, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function DoubtThreadPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  const threadQuery = trpc.doubt.byId.useQuery({ doubtId: id });
  const [responseText, setResponseText] = useState("");

  const respondMutation = trpc.doubt.respond.useMutation({
    onSuccess: () => {
      toast.success("Response posted");
      setResponseText("");
      void threadQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const closeMutation = trpc.doubt.close.useMutation({
    onSuccess: () => {
      toast.success("Doubt closed");
      void threadQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (threadQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (threadQuery.error || !threadQuery.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {threadQuery.error?.message ?? "Doubt not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { doubt, responses } = threadQuery.data;
  const isAuthor = doubt.studentId === userId;
  const isAddressedCreator = doubt.creatorId === userId;
  // Anyone who is not the author may respond if they have permission (the
  // server is the source of truth — we use this for optimistic UI only).
  const canRespond = !isAuthor && doubt.status !== "closed";
  const canClose = (isAuthor || isAddressedCreator) && doubt.status !== "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/dashboard/doubts">
          <ArrowLeft className="mr-1 size-4" />
          My doubts
        </Link>
      </Button>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="size-5" />
              Doubt
            </h1>
            <Badge
              variant={
                doubt.status === "closed"
                  ? "secondary"
                  : doubt.status === "creator_answered"
                    ? "default"
                    : "outline"
              }
            >
              {doubt.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm">{doubt.questionText}</p>
          <p className="text-muted-foreground text-xs">
            Asked {doubt.createdAt ? new Date(doubt.createdAt).toLocaleString("en-IN") : ""}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {responses.map((r) => (
          <Card key={r.id} className={r.isAi ? "border-dashed" : ""}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm">
                {r.isAi && <Bot className="size-4" />}
                <span className="font-medium">{r.responderName}</span>
                {r.isAi && (
                  <Badge variant="outline" className="text-[10px]">
                    AI
                  </Badge>
                )}
                {r.isAccepted && (
                  <Badge variant="default" className="gap-1 text-[10px]">
                    <CheckCircle2 className="size-3" />
                    Accepted
                  </Badge>
                )}
                <span className="text-muted-foreground ml-auto text-xs">
                  {r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN") : ""}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{r.responseText}</p>
            </CardContent>
          </Card>
        ))}

        {responses.length === 0 && (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-center text-sm">
              No responses yet.
            </CardContent>
          </Card>
        )}
      </div>

      {canRespond && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Your response</h2>
            <Textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Write an answer that helps the student understand"
              rows={4}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={respondMutation.isPending || responseText.trim().length < 1}
                onClick={() =>
                  respondMutation.mutate({
                    doubtId: id,
                    responseText: responseText.trim(),
                    markAsAnswered: true,
                  })
                }
              >
                <Send className="mr-1 size-3" />
                {respondMutation.isPending ? "Posting…" : "Post response"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canClose && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={closeMutation.isPending}
            onClick={() => closeMutation.mutate({ doubtId: id })}
          >
            <XCircle className="mr-1 size-3" />
            Mark as resolved
          </Button>
        </div>
      )}
    </div>
  );
}
