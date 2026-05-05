"use client";

import Link from "next/link";
import { use } from "react";
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  GraduationCap,
  Plus,
  UserMinus,
  MessageCircle,
  FileText,
} from "lucide-react";
import { TeacherAssignments } from "@/components/classroom/teacher-assignments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function CreatorClassroomDetailPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);

  const classroomQuery = trpc.classroom.byId.useQuery({ classroomId: id });
  const membersQuery = trpc.classroom.listMembers.useQuery(
    { classroomId: id },
    { enabled: !!classroomQuery.data?.isTeacher },
  );
  const contentQuery = trpc.classroom.listAssignedContent.useQuery({ classroomId: id });
  const myContentQuery = trpc.classroom.listMyContentForAssignment.useQuery(
    { classroomId: id },
    { enabled: !!classroomQuery.data?.isTeacher },
  );
  const doubtsQuery = trpc.doubt.listForClassroom.useQuery({ classroomId: id });

  const assignMutation = trpc.classroom.assignContent.useMutation({
    onSuccess: () => {
      toast.success("Content assigned to classroom");
      void contentQuery.refetch();
      void myContentQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const unassignMutation = trpc.classroom.unassignContent.useMutation({
    onSuccess: () => {
      toast.success("Content unassigned");
      void contentQuery.refetch();
      void myContentQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMemberMutation = trpc.classroom.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      void membersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (classroomQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (classroomQuery.error || !classroomQuery.data) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {classroomQuery.error?.message ?? "Classroom not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { classroom, isTeacher } = classroomQuery.data;
  const members = membersQuery.data ?? [];
  const assignedContent = contentQuery.data ?? [];
  const myContent = myContentQuery.data ?? [];
  const doubts = doubtsQuery.data ?? [];

  const assignedIds = new Set(assignedContent.map((c) => c.id));
  const unassignedContent = myContent.filter((c) => !assignedIds.has(c.id));

  function copyJoinCode(): void {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard.writeText(classroom.joinCode).then(() => {
      toast.success(`Copied join code ${classroom.joinCode}`);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/creator/classrooms">
          <ArrowLeft className="mr-1 size-4" />
          Classrooms
        </Link>
      </Button>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="size-6" />
            {classroom.name}
          </h1>
          {classroom.description && (
            <p className="text-muted-foreground mt-1 text-sm">{classroom.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {classroom.joinCode}
          </Badge>
          <Button variant="outline" size="sm" onClick={copyJoinCode}>
            <Copy className="mr-1 size-3" />
            Copy
          </Button>
          <Badge variant="secondary">
            {classroom.studentCount} / {classroom.maxStudents} students
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">
            <FileText className="mr-1 size-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <ClipboardList className="mr-1 size-4" />
            Assignments
          </TabsTrigger>
          {isTeacher && (
            <TabsTrigger value="members">
              <GraduationCap className="mr-1 size-4" />
              Members
            </TabsTrigger>
          )}
          <TabsTrigger value="doubts">
            <MessageCircle className="mr-1 size-4" />
            Doubts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <TeacherAssignments classroomId={id} />
        </TabsContent>

        {/* Content tab */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Assigned content</h2>
                <Badge variant="outline">{assignedContent.length}</Badge>
              </div>
              {assignedContent.length === 0 && (
                <p className="text-muted-foreground text-sm">No content assigned yet.</p>
              )}
              {assignedContent.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{c.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {c.contentType} · {c.isPublished ? "published" : "draft"}
                    </div>
                  </div>
                  {isTeacher && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={unassignMutation.isPending}
                      onClick={() => unassignMutation.mutate({ classroomId: id, contentId: c.id })}
                    >
                      Unassign
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {isTeacher && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h2 className="font-semibold">Available content</h2>
                {unassignedContent.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    All your content is already assigned. Create more from the{" "}
                    <Link href="/creator" className="underline">
                      Creator Hub
                    </Link>
                    .
                  </p>
                ) : (
                  unassignedContent.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{c.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {c.contentType} · {c.isPublished ? "published" : "draft"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={assignMutation.isPending}
                        onClick={() => assignMutation.mutate({ classroomId: id, contentId: c.id })}
                      >
                        <Plus className="mr-1 size-3" />
                        Assign
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Members tab — teacher only */}
        {isTeacher && (
          <TabsContent value="members" className="space-y-3">
            {members.length === 0 && (
              <Card>
                <CardContent className="py-6 text-center text-sm">
                  No members yet. Share the join code{" "}
                  <span className="font-mono font-semibold">{classroom.joinCode}</span> with
                  students.
                </CardContent>
              </Card>
            )}
            {members.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {m.email}
                      {m.joinedAt
                        ? ` · joined ${new Date(m.joinedAt).toLocaleDateString("en-IN")}`
                        : ""}
                    </div>
                  </div>
                  <Badge variant={m.status === "active" ? "default" : "outline"}>{m.status}</Badge>
                  {m.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={removeMemberMutation.isPending}
                      onClick={() =>
                        removeMemberMutation.mutate({
                          classroomId: id,
                          studentId: m.studentId,
                        })
                      }
                    >
                      <UserMinus className="mr-1 size-3" />
                      Remove
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}

        {/* Doubts tab */}
        <TabsContent value="doubts" className="space-y-3">
          {doubts.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm">
                No doubts in this classroom yet.
              </CardContent>
            </Card>
          )}
          {doubts.map((d) => (
            <Link key={d.id} href={`/creator/doubts/${d.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{d.studentName}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {d.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-sm">{d.questionText}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
