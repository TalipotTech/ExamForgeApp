"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, GraduationCap, FileText, MessageCircle, Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

export default function StudentClassroomDetailPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);
  const router = useRouter();

  const classroomQuery = trpc.classroom.byId.useQuery({ classroomId: id });
  const contentQuery = trpc.classroom.listAssignedContent.useQuery({ classroomId: id });
  const doubtsQuery = trpc.doubt.listForClassroom.useQuery({ classroomId: id });

  const [questionText, setQuestionText] = useState("");
  const askMutation = trpc.doubt.ask.useMutation({
    onSuccess: () => {
      toast.success("Doubt posted");
      setQuestionText("");
      void doubtsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const leaveMutation = trpc.classroom.leave.useMutation({
    onSuccess: () => {
      toast.success("Left classroom");
      router.push("/dashboard/classrooms");
    },
    onError: (err) => toast.error(err.message),
  });

  if (classroomQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (classroomQuery.error || !classroomQuery.data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {classroomQuery.error?.message ?? "Classroom not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { classroom, isTeacher } = classroomQuery.data;
  const content = contentQuery.data ?? [];
  const doubts = doubtsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/dashboard/classrooms">
          <ArrowLeft className="mr-1 size-4" />
          My Classrooms
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
          {classroom.subject && (
            <Badge variant="secondary" className="mt-2">
              {classroom.subject}
            </Badge>
          )}
        </div>
        {!isTeacher && (
          <Button
            variant="outline"
            size="sm"
            disabled={leaveMutation.isPending}
            onClick={() => {
              if (confirm("Leave this classroom?")) {
                leaveMutation.mutate({ classroomId: id });
              }
            }}
          >
            <LogOut className="mr-1 size-3" />
            Leave
          </Button>
        )}
      </div>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">
            <FileText className="mr-1 size-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="doubts">
            <MessageCircle className="mr-1 size-4" />
            Doubts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-3">
          {content.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm">
                <p className="font-medium">No content assigned yet.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Your teacher will add content here.
                </p>
              </CardContent>
            </Card>
          ) : (
            content.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {c.thumbnailUrl && (
                      <div
                        className="bg-muted size-16 shrink-0 rounded-md bg-cover bg-center"
                        style={{ backgroundImage: `url('${c.thumbnailUrl}')` }}
                      />
                    )}
                    <div className="flex-1">
                      <h2 className="font-semibold">{c.title}</h2>
                      {c.description && (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                          {c.description}
                        </p>
                      )}
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {c.contentType}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="doubts" className="space-y-3">
          {!isTeacher && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Label htmlFor="doubt-text" className="flex items-center gap-2 font-semibold">
                  <Plus className="size-4" />
                  Ask a doubt
                </Label>
                <Textarea
                  id="doubt-text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="What's your question?"
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={askMutation.isPending || questionText.trim().length < 5}
                    onClick={() => {
                      askMutation.mutate({
                        classroomId: id,
                        questionText: questionText.trim(),
                        isPublic: true,
                      });
                    }}
                  >
                    {askMutation.isPending ? "Posting…" : "Post doubt"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {doubts.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm">No doubts yet.</CardContent>
            </Card>
          ) : (
            doubts.map((d) => (
              <Link key={d.id} href={`/dashboard/doubts/${d.id}`}>
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
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
