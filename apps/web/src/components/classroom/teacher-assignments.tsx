"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CalendarClock, FileText, Paperclip, Plus, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

type UploadedFile = {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
};

async function uploadAssignmentFile(
  file: File,
  scope: "assignment" | "submission",
  scopeId: string,
): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("scope", scope);
  fd.append("scopeId", scopeId);
  fd.append("file", file);
  const res = await fetch("/api/assignments/upload-file", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const json = (await res.json()) as
    | { success: true; data: UploadedFile }
    | { success: false; error: { message: string } };
  if (!res.ok || !json.success) {
    throw new Error(json.success === false ? json.error.message : "Upload failed");
  }
  return json.data;
}

export function TeacherAssignments({ classroomId }: { classroomId: string }): React.ReactElement {
  const listQuery = trpc.assignment.listForClassroom.useQuery({ classroomId });
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Assignments</h2>
          <p className="text-muted-foreground text-xs">
            Post work, attach a file, set a due date. Students submit text or files back.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 size-3" />
          {showForm ? "Close" : "New assignment"}
        </Button>
      </div>

      {showForm && (
        <CreateAssignmentForm
          classroomId={classroomId}
          onCreated={() => {
            setShowForm(false);
            void listQuery.refetch();
          }}
        />
      )}

      {listQuery.isLoading ? (
        <Card>
          <CardContent className="py-6 text-center text-sm">Loading…</CardContent>
        </Card>
      ) : (listQuery.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm">
            <p className="font-medium">No assignments yet.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Click &ldquo;New assignment&rdquo; to post your first one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(listQuery.data ?? []).map((a) => (
            <TeacherAssignmentRow
              key={a.id}
              assignment={a}
              classroomId={classroomId}
              onDeleted={() => void listQuery.refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAssignmentForm({
  classroomId,
  onCreated,
}: {
  classroomId: string;
  onCreated: () => void;
}): React.ReactElement {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createMutation = trpc.assignment.create.useMutation({
    onSuccess: () => {
      toast.success("Assignment created");
      setTitle("");
      setInstructions("");
      setDueAt("");
      setUploaded(null);
      if (fileRef.current) fileRef.current.value = "";
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await uploadAssignmentFile(file, "assignment", classroomId);
      setUploaded(data);
      toast.success(`Uploaded ${data.fileName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  }

  function handleSubmit(): void {
    if (title.trim().length < 2) {
      toast.error("Title is required");
      return;
    }
    createMutation.mutate({
      classroomId,
      title: title.trim(),
      instructions: instructions.trim() || undefined,
      dueAt: dueAt ? new Date(dueAt) : undefined,
      attachmentUrl: uploaded?.url,
      attachmentFileName: uploaded?.fileName,
      attachmentMimeType: uploaded?.mimeType,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="asg-title">Title</Label>
          <Input
            id="asg-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Essay on pharmacology of beta-blockers"
            maxLength={500}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="asg-instructions">Instructions</Label>
          <Textarea
            id="asg-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="What should students do? (optional, markdown supported)"
            rows={4}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="asg-due" className="flex items-center gap-1">
              <CalendarClock className="size-3" />
              Due date (optional)
            </Label>
            <Input
              id="asg-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="asg-file" className="flex items-center gap-1">
              <Paperclip className="size-3" />
              Attachment (optional)
            </Label>
            <Input
              id="asg-file"
              ref={fileRef}
              type="file"
              onChange={(e) => void handlePickFile(e)}
              disabled={isUploading}
            />
            {uploaded && (
              <p className="text-muted-foreground truncate text-xs" title={uploaded.fileName}>
                Attached: {uploaded.fileName}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            disabled={createMutation.isPending || isUploading || title.trim().length < 2}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? "Creating…" : "Create assignment"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type AssignmentRow = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: Date | string | null;
  attachmentUrl: string | null;
  attachmentFileName: string | null;
  totalStudents: number | null;
  completedCount: number | null;
  averageScore: number | null;
  createdAt: Date | string;
};

function TeacherAssignmentRow({
  assignment,
  classroomId,
  onDeleted,
}: {
  assignment: AssignmentRow;
  classroomId: string;
  onDeleted: () => void;
}): React.ReactElement {
  const deleteMutation = trpc.assignment.delete.useMutation({
    onSuccess: () => {
      toast.success("Assignment deleted");
      onDeleted();
    },
    onError: (err) => toast.error(err.message),
  });

  const due = assignment.dueAt ? new Date(assignment.dueAt) : null;
  const overdue = due && due.getTime() < Date.now();

  return (
    <Card>
      <CardContent className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Link
            href={`/creator/classrooms/${classroomId}/assignments/${assignment.id}`}
            className="hover:text-primary block text-sm font-medium"
          >
            {assignment.title}
          </Link>
          {assignment.instructions && (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
              {assignment.instructions}
            </p>
          )}
          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
              <Users className="size-3" />
              {assignment.completedCount ?? 0} / {assignment.totalStudents ?? 0}
            </Badge>
            {typeof assignment.averageScore === "number" && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                avg {assignment.averageScore.toFixed(0)}
              </Badge>
            )}
            {due && (
              <span className={overdue ? "text-amber-600" : ""}>
                due {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{" "}
                {due.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {assignment.attachmentFileName && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="size-3" />
                {assignment.attachmentFileName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/creator/classrooms/${classroomId}/assignments/${assignment.id}`}>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
              <FileText className="size-3" />
              Submissions
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (confirm(`Delete "${assignment.title}"? This removes all submissions.`)) {
                deleteMutation.mutate({ assignmentId: assignment.id });
              }
            }}
          >
            <Trash2 className="size-3 text-red-500" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { uploadAssignmentFile };
export const AssignmentUploadIcon = Upload;
