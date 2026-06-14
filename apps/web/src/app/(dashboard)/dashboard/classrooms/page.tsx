"use client";

import Link from "next/link";
import { useState } from "react";
import { GraduationCap, Users, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function StudentClassroomsPage(): React.ReactElement {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const classroomsQuery = trpc.classroom.myEnrolled.useQuery();
  const joinMutation = trpc.classroom.joinByCode.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Joined classroom");
        router.push(`/dashboard/classrooms/${data.classroomId}`);
      } else if (data.reason === "NOT_FOUND") {
        toast.error("No classroom with that code");
      } else if (data.reason === "FULL") {
        toast.error("This classroom is full");
      } else if (data.reason === "OWN_CLASSROOM") {
        toast.error("This is your own classroom — you can access it from Creator Hub");
      } else if (data.reason === "PAYMENT_REQUIRED") {
        toast.error("Paid classroom — payment flow not yet available");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const items = classroomsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <GraduationCap className="size-6" />
          My Classrooms
        </h1>
        <p className="text-muted-foreground text-sm">
          Classrooms you&apos;re enrolled in and the content your teachers have shared.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Join a classroom
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinCode.trim().length < 4) {
                toast.error("Enter a valid join code");
                return;
              }
              joinMutation.mutate({ joinCode: joinCode.trim() });
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="join-code">Classroom code</Label>
              <Input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. GPT26M"
                maxLength={10}
                className="font-mono uppercase"
              />
            </div>
            <Button type="submit" disabled={joinMutation.isPending}>
              {joinMutation.isPending ? "Joining…" : "Join"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {classroomsQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {classroomsQuery.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {classroomsQuery.error.message.includes("FEATURE_DISABLED")
              ? "Classrooms are not yet enabled."
              : classroomsQuery.error.message}
          </CardContent>
        </Card>
      )}

      {!classroomsQuery.isLoading && !classroomsQuery.error && items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm">
            <GraduationCap className="text-muted-foreground mx-auto mb-2 size-8" />
            <p className="font-medium">Not in any classrooms yet.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Ask your teacher for a join code to get started.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((c) => (
          <Link key={c.id} href={`/dashboard/classrooms/${c.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex-1">
                  <h2 className="font-semibold">{c.name}</h2>
                  {c.description && (
                    <p className="text-muted-foreground line-clamp-1 text-xs">{c.description}</p>
                  )}
                  {c.subject && <p className="text-muted-foreground mt-1 text-xs">{c.subject}</p>}
                </div>
                <Badge variant="outline" className="gap-1">
                  <Users className="size-3" />
                  {c.studentCount}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
