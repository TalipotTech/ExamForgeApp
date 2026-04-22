"use client";

import Link from "next/link";
import { ArrowLeft, Plus, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export default function CreatorClassroomsPage(): React.ReactElement {
  const classroomsQuery = trpc.classroom.myTaught.useQuery();

  const items = classroomsQuery.data ?? [];

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
            <GraduationCap className="size-6" />
            Classrooms
          </h1>
        </div>
        <Button asChild>
          <Link href="/creator/classrooms/new">
            <Plus className="mr-1 size-4" />
            New classroom
          </Link>
        </Button>
      </div>

      {classroomsQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
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
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GraduationCap className="text-muted-foreground size-8" />
            <p className="font-medium">No classrooms yet.</p>
            <p className="text-muted-foreground text-sm">
              Create a classroom to share curated content with a cohort of students.
            </p>
            <Button asChild>
              <Link href="/creator/classrooms/new">
                <Plus className="mr-1 size-4" />
                Create classroom
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((c) => (
          <Link key={c.id} href={`/creator/classrooms/${c.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{c.name}</h2>
                    {c.isPaid ? (
                      <Badge variant="default" className="text-[10px]">
                        paid
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        free
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {c.joinCode}
                    </Badge>
                  </div>
                  {c.description && (
                    <p className="text-muted-foreground line-clamp-1 text-xs">{c.description}</p>
                  )}
                  {c.subject && <p className="text-muted-foreground mt-1 text-xs">{c.subject}</p>}
                </div>
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Users className="size-3" />
                  {c.studentCount} / {c.maxStudents}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
