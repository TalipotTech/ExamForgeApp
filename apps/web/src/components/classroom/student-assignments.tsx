"use client";

import Link from "next/link";
import { CalendarClock, ClipboardList, Paperclip } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export function StudentAssignments({ classroomId }: { classroomId: string }): React.ReactElement {
  const listQuery = trpc.assignment.listForClassroom.useQuery({ classroomId });
  const list = listQuery.data ?? [];

  if (listQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">
          <ClipboardList className="text-muted-foreground mx-auto mb-2 size-6" />
          <p className="font-medium">No assignments yet.</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Your teacher hasn&apos;t posted any assignments for this classroom.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {list.map((a) => {
        const due = a.dueAt ? new Date(a.dueAt) : null;
        const overdue = due && due.getTime() < Date.now();
        return (
          <Card key={a.id} className="transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Link
                  href={`/dashboard/classrooms/${classroomId}/assignments/${a.id}`}
                  className="hover:text-primary text-sm font-medium"
                >
                  {a.title}
                </Link>
                {a.instructions && (
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    {a.instructions}
                  </p>
                )}
                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  {due && (
                    <span
                      className={`inline-flex items-center gap-1 ${overdue ? "text-amber-600" : ""}`}
                    >
                      <CalendarClock className="size-3" />
                      due {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{" "}
                      {due.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {a.attachmentFileName && (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3" />
                      {a.attachmentFileName}
                    </span>
                  )}
                </div>
              </div>
              <Link href={`/dashboard/classrooms/${classroomId}/assignments/${a.id}`}>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  Open
                </Button>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
