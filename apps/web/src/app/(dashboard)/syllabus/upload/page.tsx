"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle, Loader2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export default function SyllabusUploadPage(): React.ReactElement {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [examId, setExamId] = useState("");
  const [syllabusName, setSyllabusName] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [syllabusId, setSyllabusId] = useState<number | null>(null);

  const examsQuery = trpc.exam.listPublic.useQuery({});
  const examOptions = examsQuery.data?.exams ?? [];

  const getUploadUrl = trpc.syllabus.getUploadUrl.useMutation();
  const processUpload = trpc.syllabus.processUpload.useMutation();
  const statusQuery = trpc.syllabus.getStatus.useQuery(
    { syllabusId: syllabusId! },
    {
      enabled: stage === "processing" && syllabusId !== null,
      refetchInterval: 2000,
    },
  );

  // Monitor processing status
  if (stage === "processing" && statusQuery.data && statusQuery.data.status === "parsed") {
    setStage("done");
    toast.success("Syllabus processed successfully!");
  }
  if (stage === "processing" && statusQuery.data && statusQuery.data.status === "error") {
    setStage("error");
    setErrorMsg(statusQuery.data.errorMessage ?? "Processing failed");
  }

  const handleDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile?.type === "application/pdf") {
        setFile(droppedFile);
        if (!syllabusName) {
          setSyllabusName(droppedFile.name.replace(/\.pdf$/i, ""));
        }
      } else {
        toast.error("Please upload a PDF file");
      }
    },
    [syllabusName],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        setFile(selectedFile);
        if (!syllabusName) {
          setSyllabusName(selectedFile.name.replace(/\.pdf$/i, ""));
        }
      }
    },
    [syllabusName],
  );

  async function handleUpload(): Promise<void> {
    if (!file || !examId) return;

    try {
      setStage("uploading");
      setUploadProgress(0);

      // 1. Get presigned URL
      const { syllabusId: id, uploadUrl } = await getUploadUrl.mutateAsync({
        filename: file.name,
        examId,
        mimeType: file.type,
      });

      setSyllabusId(id);
      setUploadProgress(30);

      // 2. Upload to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(30 + Math.round((e.loaded / e.total) * 40));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setUploadProgress(75);

      // 3. Queue processing
      await processUpload.mutateAsync({ syllabusId: id });

      setUploadProgress(100);
      setStage("processing");
    } catch (err) {
      setStage("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      toast.error("Upload failed");
    }
  }

  function handleRetry(): void {
    setStage("idle");
    setUploadProgress(0);
    setErrorMsg("");
    setSyllabusId(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Syllabus</h1>
        <p className="text-muted-foreground text-sm">
          Upload a PDF syllabus to extract its structure with AI
        </p>
      </div>

      {/* Exam Selector */}
      <div className="space-y-2">
        <Label>Target Exam</Label>
        <Select value={examId} onValueChange={setExamId} disabled={stage !== "idle"}>
          <SelectTrigger>
            <SelectValue placeholder="Select an exam" />
          </SelectTrigger>
          <SelectContent>
            {examOptions.map((e: { id: string; name: string }) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Syllabus Name */}
      <div className="space-y-2">
        <Label>Syllabus Name</Label>
        <Input
          value={syllabusName}
          onChange={(e) => setSyllabusName(e.target.value)}
          placeholder="Auto-filled from filename"
          disabled={stage !== "idle"}
        />
      </div>

      {/* Drop Zone */}
      {stage === "idle" && (
        <Card
          className="hover:border-primary/50 cursor-pointer border-2 border-dashed transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => document.getElementById("pdf-input")?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            {file ? (
              <>
                <FileText className="text-primary mb-3 h-12 w-12" />
                <p className="font-medium">{file.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Upload className="text-muted-foreground mb-3 h-12 w-12" />
                <p className="text-muted-foreground">
                  Drag and drop a PDF here, or click to browse
                </p>
                <p className="text-muted-foreground mt-1 text-xs">Max 50MB</p>
              </>
            )}
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </CardContent>
        </Card>
      )}

      {/* Progress States */}
      {(stage === "uploading" || stage === "processing") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stage === "uploading" ? "Uploading..." : "Processing..."}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={stage === "processing" ? 100 : uploadProgress} />
            <div className="space-y-2 text-sm">
              <StepIndicator
                done={uploadProgress >= 30}
                active={uploadProgress < 30}
                label="Uploading to storage"
              />
              <StepIndicator
                done={uploadProgress >= 75}
                active={uploadProgress >= 30 && uploadProgress < 75}
                label="Uploading PDF"
              />
              <StepIndicator
                done={stage === "processing"}
                active={uploadProgress >= 75 && stage === "uploading"}
                label="Queuing for processing"
              />
              <StepIndicator
                done={false}
                active={stage === "processing"}
                label="Extracting text & parsing structure"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {stage === "done" && syllabusId && (
        <Card className="border-green-500/50">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <CheckCircle className="mb-3 h-12 w-12 text-green-500" />
            <p className="font-medium">Syllabus processed successfully!</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {statusQuery.data?.pageCount ?? 0} pages parsed
            </p>
            <Button className="mt-4" onClick={() => router.push(`/syllabus/${syllabusId}` as "/")}>
              View Syllabus Tree
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {stage === "error" && (
        <Card className="border-red-500/50">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="mb-3 h-12 w-12 text-red-500" />
            <p className="font-medium">Processing failed</p>
            <p className="text-muted-foreground mt-1 text-sm">{errorMsg}</p>
            <Button variant="outline" className="mt-4" onClick={handleRetry}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Button */}
      {stage === "idle" && (
        <Button className="w-full" size="lg" disabled={!file || !examId} onClick={handleUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Process Syllabus
        </Button>
      )}
    </div>
  );
}

function StepIndicator({
  done,
  active,
  label,
}: {
  done: boolean;
  active: boolean;
  label: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : active ? (
        <Loader2 className="text-primary h-4 w-4 animate-spin" />
      ) : (
        <div className="border-muted-foreground/30 h-4 w-4 rounded-full border" />
      )}
      <span
        className={
          done ? "text-muted-foreground" : active ? "font-medium" : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </div>
  );
}
