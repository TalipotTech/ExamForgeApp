"use client";

/**
 * Content upload page — structural port of PadVik's upload flow, adapted
 * to ExamForge:
 *   - Routes at /creator/content/*
 *   - Tags by Exam + Subject + Topic (ExamForge's model) instead of
 *     PadVik's Board/Standard/Subject/Chapter/Topic cascade
 *   - OCR for handwritten images — Gemini 2.5 Pro / Flash or Claude
 *     Sonnet 4.6 via the ocr-worker queue (async after upload)
 *   - File upload goes through the Next.js route at /api/creator-content
 */

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Loader2,
  FileVideo,
  FileAudio,
  FileText,
  Image as ImageIcon,
  X,
  Sparkles,
  ArrowLeft,
  FolderOpen,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

type SelectedFile = {
  file: File;
  preview: string; // blob URL for images, empty otherwise
  type: "video" | "audio" | "image" | "document";
};

function getFileType(file: File): SelectedFile["type"] {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return "document";
}

function FileTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}): React.ReactElement {
  const cls = className ?? "h-5 w-5";
  switch (type) {
    case "video":
      return <FileVideo className={`${cls} text-blue-500`} />;
    case "audio":
      return <FileAudio className={`${cls} text-green-500`} />;
    case "image":
      return <ImageIcon className={`${cls} text-amber-500`} />;
    default:
      return <FileText className={`${cls} text-red-500`} />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type OcrModel = "gemini-2.5-pro" | "gemini-2.5-flash" | "claude-sonnet-4-6" | "gpt-4o";

type LastUpload = {
  id: string;
  title: string;
  fileCount: number;
  ocrQueued: number;
  at: number; // ms timestamp — used as React key so the badge re-mounts (and re-animates) on each new success
};

export default function ContentUploadPage(): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [handwritten, setHandwritten] = useState(false);
  const [ocrModel, setOcrModel] = useState<OcrModel>("gemini-2.5-pro");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState("en");
  const [isPremium, setIsPremium] = useState(false);
  const [examId, setExamId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [lastUpload, setLastUpload] = useState<LastUpload | null>(null);

  const examsQuery = trpc.exam.listPublic.useQuery({
    page: 1,
    limit: 50,
    sort: "name",
  });
  const exams = examsQuery.data?.exams ?? [];

  const hasImages = selectedFiles.some((f) => f.type === "image");

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>): void {
    const newFiles = Array.from(e.target.files ?? []).map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      type: getFileType(file),
    }));
    setSelectedFiles((prev) => [...prev, ...newFiles].slice(0, 20));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number): void {
    setSelectedFiles((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  /** Clear every form field + selected file so the page is ready for a fresh
   *  upload without a manual reload. Revokes blob URLs to avoid leaking image
   *  previews across uploads. Does NOT touch the success badge — that lives
   *  in `lastUpload` and is set immediately before this runs. */
  function resetForm(): void {
    for (const sf of selectedFiles) {
      if (sf.preview) URL.revokeObjectURL(sf.preview);
    }
    setSelectedFiles([]);
    setHandwritten(false);
    setOcrModel("gemini-2.5-pro");
    setTitle("");
    setDescription("");
    setBody("");
    setLanguage("en");
    setIsPremium(false);
    setExamId("");
    setSubject("");
    setTopic("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (title.trim().length < 2) {
      toast.error("Title is required");
      return;
    }
    if (selectedFiles.length === 0 && !body.trim()) {
      toast.error("Add at least one file or some text content");
      return;
    }

    setUploading(true);
    const fileCount = selectedFiles.length;
    const submittedTitle = title.trim();
    const fd = new FormData();
    fd.append("title", submittedTitle);
    if (description.trim()) fd.append("description", description.trim());
    if (body.trim()) fd.append("body", body.trim());
    fd.append("language", language);
    fd.append("isPremium", String(isPremium));
    if (handwritten) {
      fd.append("handwritten", "true");
      fd.append("ocrModel", ocrModel);
    }
    if (examId) fd.append("examId", examId);
    if (subject.trim()) fd.append("subject", subject.trim());
    if (topic.trim()) fd.append("topic", topic.trim());
    for (const sf of selectedFiles) fd.append("files", sf.file);

    try {
      const res = await fetch("/api/creator-content/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json()) as
        | { success: true; data: { id: string; ocrQueued?: number } }
        | { success: false; error: { message: string } };
      if (!res.ok || !data.success) {
        const msg = !data.success ? data.error?.message : "Upload failed";
        toast.error(msg ?? "Upload failed");
        return;
      }
      toast.success("Content uploaded!");
      // Stay on the page so the creator can immediately upload another item.
      // Surface a persistent badge with a deep-link to the new content so
      // they don't lose track of what they just submitted.
      setLastUpload({
        id: data.data.id,
        title: submittedTitle,
        fileCount,
        ocrQueued: data.data.ocrQueued ?? 0,
        at: Date.now(),
      });
      resetForm();
      // Scroll back to the top so the success badge is in view after the
      // form below collapses to its empty state.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const typeCounts = selectedFiles.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/creator/content">
            <Button variant="ghost" size="icon" type="button" title="Back to My Contents">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Upload Content</h1>
        </div>
        <Link href="/creator/content">
          <Button variant="outline" size="sm" type="button" className="gap-1.5">
            <FolderOpen className="size-3.5" />
            My Contents
          </Button>
        </Link>
      </div>

      {lastUpload && (
        // `key={lastUpload.at}` re-mounts the badge on each new success so the
        // fade-in animation re-runs even if the previous badge was still on
        // screen (creator uploads two items back-to-back).
        <div
          key={lastUpload.at}
          className="animate-in fade-in slide-in-from-top-2 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 duration-300 dark:border-emerald-900 dark:bg-emerald-950/30"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Upload complete
            </p>
            <p className="mt-0.5 truncate text-xs text-emerald-800/80 dark:text-emerald-200/80">
              <span className="font-medium">{lastUpload.title}</span>
              {lastUpload.fileCount > 0
                ? ` · ${lastUpload.fileCount} file${lastUpload.fileCount !== 1 ? "s" : ""}`
                : ""}
              {lastUpload.ocrQueued > 0
                ? ` · ${lastUpload.ocrQueued} image${lastUpload.ocrQueued !== 1 ? "s" : ""} queued for OCR`
                : ""}
              . The form is reset — upload another or open it below.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link href={`/creator/content/${lastUpload.id}` as "/"}>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="h-7 gap-1 border-emerald-300 bg-white text-xs text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900"
              >
                <ExternalLink className="size-3" />
                Open
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="size-7 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-900"
              title="Dismiss"
              onClick={() => setLastUpload(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Drop Zone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Files</span>
              {selectedFiles.length > 0 && (
                <span className="text-muted-foreground text-xs font-normal">
                  {selectedFiles.length} file
                  {selectedFiles.length !== 1 ? "s" : ""} ·{" "}
                  {Object.entries(typeCounts)
                    .map(([t, c]) => `${c} ${t}`)
                    .join(", ")}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {selectedFiles.map((sf, i) => (
                  <div
                    key={i}
                    className="bg-muted/30 group relative overflow-hidden rounded-lg border"
                  >
                    <div className="flex aspect-square items-center justify-center p-2">
                      {sf.preview ? (
                        <img
                          src={sf.preview}
                          alt={sf.file.name}
                          className="h-full w-full rounded object-cover"
                        />
                      ) : (
                        <FileTypeIcon type={sf.type} className="size-10" />
                      )}
                    </div>
                    <div className="bg-background border-t px-2 py-1.5">
                      <p className="truncate text-[10px] font-medium">{sf.file.name}</p>
                      <p className="text-muted-foreground text-[9px]">
                        {formatSize(sf.file.size)} · {sf.type}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="hover:border-primary/50 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="text-muted-foreground mx-auto size-8" />
              <p className="mt-2 text-sm">
                {selectedFiles.length === 0 ? "Click to add files" : "Add more files"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Video, audio, images, PDF, DOCX, PPTX — up to 20 files
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="video/*,audio/*,image/*,.pdf,.docx,.pptx,.doc,.ppt"
              multiple
              onChange={handleFilesSelected}
            />

            {hasImages && (
              <div className="space-y-2">
                <label className="hover:bg-muted/30 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors">
                  <input
                    type="checkbox"
                    checked={handwritten}
                    onChange={(e) => setHandwritten(e.target.checked)}
                    className="rounded"
                  />
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-violet-500" />
                    <div>
                      <p className="text-sm font-medium">Extract text from images (AI OCR)</p>
                      <p className="text-muted-foreground text-xs">
                        Handwritten notes → Markdown via Claude Vision or Gemini. Processing happens
                        in the background after upload.
                      </p>
                    </div>
                  </div>
                </label>
                {handwritten && (
                  <div className="bg-muted/20 space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <Label className="text-sm font-medium">OCR Model</Label>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          Gemini 2.5 Pro is best for handwriting. Worker falls back to the next
                          model on failure.
                        </p>
                      </div>
                      <Select value={ocrModel} onValueChange={(v) => setOcrModel(v as OcrModel)}>
                        <SelectTrigger className="w-[260px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-2.5-pro">
                            Gemini 2.5 Pro (best for vision)
                          </SelectItem>
                          <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (fast)</SelectItem>
                          <SelectItem value="claude-sonnet-4-6">
                            Claude Sonnet 4.6 (Anthropic)
                          </SelectItem>
                          <SelectItem value="gpt-4o">
                            GPT-4o (OpenAI · resilience fallback)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Text Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Text Notes (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[120px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add text notes, explanations, or descriptions (Markdown supported)…"
            />
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title of your content"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="border-input bg-background flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description for students"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="ml">Malayalam</SelectItem>
                    <SelectItem value="ta">Tamil</SelectItem>
                    <SelectItem value="te">Telugu</SelectItem>
                    <SelectItem value="kn">Kannada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Label className="flex h-10 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isPremium}
                    onChange={(e) => setIsPremium(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Premium</span>
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exam + Syllabus Tagging */}
        <Card>
          <CardHeader>
            <CardTitle>Exam Tagging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Tag content to an exam + subject / topic so students find it via their prep track.
            </p>
            <div className="space-y-2.5">
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select exam (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject — e.g. Pharmacology"
              />
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topic — e.g. Receptor pharmacology"
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full gap-2" disabled={uploading}>
          {uploading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Uploading {selectedFiles.length} file
              {selectedFiles.length !== 1 ? "s" : ""}…
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Upload Content
              {selectedFiles.length > 0
                ? ` (${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""})`
                : ""}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
