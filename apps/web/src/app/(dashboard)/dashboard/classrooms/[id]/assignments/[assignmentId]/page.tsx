"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type UploadedFile = {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
};

async function uploadSubmissionFile(assignmentId: string, file: File): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("scope", "submission");
  fd.append("scopeId", assignmentId);
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

export default function StudentAssignmentSubmitPage(props: {
  params: Promise<{ id: string; assignmentId: string }>;
}): React.ReactElement {
  const { id, assignmentId } = use(props.params);

  const assignmentQuery = trpc.assignment.byId.useQuery({ assignmentId });
  const submissionQuery = trpc.assignment.mySubmission.useQuery({ assignmentId });

  const [text, setText] = useState("");
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (submissionQuery.data) {
      setText(submissionQuery.data.submissionText ?? "");
      if (submissionQuery.data.submissionUrl && submissionQuery.data.submissionFileName) {
        setUploaded({
          url: submissionQuery.data.submissionUrl,
          fileName: submissionQuery.data.submissionFileName,
          mimeType: submissionQuery.data.submissionMimeType ?? "application/octet-stream",
          size: 0,
        });
      }
    }
  }, [submissionQuery.data]);

  const submitMutation = trpc.assignment.submit.useMutation({
    onSuccess: () => {
      toast.success("Submission saved");
      void submissionQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await uploadSubmissionFile(assignmentId, file);
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
    const trimmed = text.trim();
    if (!trimmed && !uploaded) {
      toast.error("Write something or attach a file");
      return;
    }
    submitMutation.mutate({
      assignmentId,
      submissionText: trimmed || undefined,
      submissionUrl: uploaded?.url,
      submissionFileName: uploaded?.fileName,
      submissionMimeType: uploaded?.mimeType,
    });
  }

  if (assignmentQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (assignmentQuery.error || !assignmentQuery.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {assignmentQuery.error?.message ?? "Assignment not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { assignment, classroom } = assignmentQuery.data;
  const existing = submissionQuery.data;
  const graded = existing?.status === "graded";
  const due = assignment.dueAt ? new Date(assignment.dueAt) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href={`/dashboard/classrooms/${id}`}>
          <ArrowLeft className="mr-1 size-4" />
          {classroom.name}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">{assignment.title}</h1>
        {assignment.instructions && (
          <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-sm">
            {assignment.instructions}
          </p>
        )}
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
          {due && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              due {due.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )}
          {assignment.attachmentUrl && assignment.attachmentFileName && (
            <a
              href={assignment.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary inline-flex items-center gap-1 underline"
            >
              <Paperclip className="size-3" />
              {assignment.attachmentFileName}
            </a>
          )}
        </div>
      </div>

      {graded && existing && (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span className="text-sm font-medium">Graded</span>
              <Badge variant="default">{existing.score?.toFixed(0) ?? "—"} / 100</Badge>
            </div>
            {existing.feedback && (
              <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-sm">
                <span className="text-foreground font-medium">Teacher&apos;s comment:</span>{" "}
                {existing.feedback}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-semibold">
            {existing ? (graded ? "Your submission" : "Edit your submission") : "Your submission"}
          </h2>

          <div className="space-y-1">
            <Label htmlFor="sub-text">Text (optional if a file is attached)</Label>
            <Textarea
              id="sub-text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={graded}
              placeholder="Type your answer here. Markdown is fine."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sub-file" className="flex items-center gap-1">
              <Upload className="size-3" />
              File (optional)
            </Label>
            <Input
              id="sub-file"
              ref={fileRef}
              type="file"
              onChange={(e) => void handlePickFile(e)}
              disabled={graded || isUploading}
            />
            {uploaded && (
              <p className="text-muted-foreground truncate text-xs" title={uploaded.fileName}>
                Attached: {uploaded.fileName}
              </p>
            )}
          </div>

          {!graded && (
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={submitMutation.isPending || isUploading}
                onClick={handleSubmit}
              >
                {submitMutation.isPending ? "Saving…" : existing ? "Update submission" : "Submit"}
              </Button>
            </div>
          )}

          {existing && !graded && (
            <p className="text-muted-foreground text-xs">
              Submitted{" "}
              {existing.submittedAt ? new Date(existing.submittedAt).toLocaleString("en-IN") : "—"}.
              You can update until your teacher grades it.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
