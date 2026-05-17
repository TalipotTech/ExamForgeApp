"use client";

/**
 * Content detail / edit page — structural port of PadVik's
 * /dashboard/creator/content/[id] with ExamForge's ids and schema.
 *
 * Tabs:
 *   - Preview — media (video / audio / image / inline PDF) + body
 *     with image lightbox.
 *   - Edit — details, per-file replace/delete for non-image media,
 *     side-by-side ImageOcrEditor for each image on handwritten
 *     content, add-more dropzone, markdown body textarea.
 *
 * When the content is flagged handwritten and OCR is enabled, the page
 * polls the byId query every 5 s while any image is pending/processing
 * so the extracted text appears without a manual refresh.
 */

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Save,
  Globe,
  ArrowLeft,
  Eye,
  Pencil,
  FileText,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  Download,
  RefreshCw,
  Trash2,
  Plus,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownRenderer } from "@/components/content/markdown-renderer";
import { ImageLightbox } from "@/components/content/image-lightbox";
import { ImageOcrEditor } from "@/components/content/image-ocr-editor";
import { MediaPreview } from "@/components/content/media-preview";
import { AiTutorChat } from "@/components/classroom/ai-tutor-chat";
import { trpc } from "@/lib/trpc";

type MediaType = "video" | "audio" | "image" | "document";
type OcrStatus = "pending" | "processing" | "completed" | "failed";

type MediaItem = {
  type: MediaType;
  url: string;
  fileUploadId: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  order: number;
  extractedText?: string;
  duration?: number;
  // OCR pipeline (documents + images) — populated by the OCR worker.
  ocrStatus?: OcrStatus;
  ocrModel?: string;
  ocrError?: string;
  // Transcription pipeline (audio + video) — populated by the
  // transcription worker. Shares the extractedText slot with OCR.
  transcriptionStatus?: OcrStatus;
  transcriptionModel?: string;
  transcriptionError?: string;
};

function FileIcon({ type, className }: { type: string; className?: string }): React.ReactElement {
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
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaItemEditor({
  item,
  onRemove,
  onReplace,
  replacing,
  onExtractText,
  extracting,
  onTranscribe,
  transcribing,
}: {
  item: MediaItem;
  onRemove: () => void;
  onReplace: (file: File) => void;
  replacing?: boolean;
  onExtractText?: () => void;
  extracting?: boolean;
  onTranscribe?: () => void;
  transcribing?: boolean;
}): React.ReactElement {
  const replaceRef = useRef<HTMLInputElement>(null);
  const [showExtracted, setShowExtracted] = useState(false);
  // For documents we look at ocrStatus, for audio/video at transcriptionStatus.
  // The displayed status (pending / processing / completed / failed) drives
  // the same UI — only the verb in the label differs.
  const isMedia = item.type === "audio" || item.type === "video";
  const pipelineStatus = isMedia ? item.transcriptionStatus : item.ocrStatus;
  const pipelineModel = isMedia ? item.transcriptionModel : item.ocrModel;
  const pipelineError = isMedia ? item.transcriptionError : item.ocrError;
  const verb = isMedia ? "transcribed" : "extracted";
  const verbPresent = isMedia ? "transcribing" : "extracting";
  const verbFailed = isMedia ? "transcription failed" : "extraction failed";
  const canRevealExtracted =
    (item.type === "document" || isMedia) && !!item.extractedText && item.extractedText.length > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className="bg-muted/50 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
          {item.type === "image" ? (
            <img src={item.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <FileIcon type={item.type} className="size-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.fileName}</p>
          <p className="text-muted-foreground text-xs capitalize">
            {item.type} · {formatSize(item.fileSize)}
            {pipelineStatus === "completed" && item.extractedText ? (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setShowExtracted((v) => !v)}
                  className="hover:text-foreground underline decoration-dotted"
                >
                  {item.extractedText.length} chars {verb} — {showExtracted ? "hide" : "view"}
                </button>
              </>
            ) : pipelineStatus === "processing" ? (
              ` · ${verbPresent}…`
            ) : pipelineStatus === "failed" ? (
              <>
                {" · "}
                <span
                  className="text-destructive cursor-help"
                  title={pipelineError ?? `${verbFailed} (no detail)`}
                >
                  {verbFailed}
                </span>
                {pipelineError && (
                  <span className="text-muted-foreground/80 ml-1 normal-case">
                    — {pipelineError.slice(0, 120)}
                    {pipelineError.length > 120 ? "…" : ""}
                  </span>
                )}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={replaceRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) onReplace(e.target.files[0]);
            }}
          />
          {onExtractText && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              title={
                item.extractedText
                  ? "Re-extract text from this document"
                  : "Extract text from this document for the AI tutor"
              }
              disabled={extracting || item.ocrStatus === "processing"}
              onClick={onExtractText}
            >
              {extracting || item.ocrStatus === "processing" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5" />
              )}
              {item.extractedText ? "Re-extract" : "Extract text"}
            </Button>
          )}
          {onTranscribe && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              title={
                item.extractedText
                  ? "Re-transcribe this file"
                  : "Transcribe this file for the AI tutor"
              }
              disabled={transcribing || item.transcriptionStatus === "processing"}
              onClick={onTranscribe}
            >
              {transcribing || item.transcriptionStatus === "processing" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5" />
              )}
              {item.extractedText ? "Re-transcribe" : "Transcribe"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title="Replace"
            disabled={replacing}
            onClick={() => replaceRef.current?.click()}
          >
            {replacing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="ghost" size="icon" className="size-8" title="Open">
              <Download className="size-3.5" />
            </Button>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive size-8"
            title="Remove"
            disabled={replacing}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {showExtracted && canRevealExtracted && (
        <div className="bg-muted/40 rounded-lg border p-3">
          <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
            <span>
              {isMedia
                ? "Transcript — this is what the AI tutor reads from this file"
                : "Extracted text — this is what the AI tutor reads from this file"}
            </span>
            {pipelineModel && (
              <Badge variant="outline" className="text-[10px]">
                {pipelineModel}
              </Badge>
            )}
          </div>
          <div className="bg-background max-h-96 overflow-auto rounded-md border p-3">
            <MarkdownRenderer content={item.extractedText ?? ""} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContentDetailPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);

  const contentQuery = trpc.creatorContent.byId.useQuery({ contentId: id });
  const content = contentQuery.data ?? null;

  // Auto-refetch while any extraction job is in flight (OCR for
  // documents/images, transcription for audio/video) so the extracted
  // text / transcript lands without the creator having to reload.
  const hasInFlightExtraction =
    ((content?.mediaItems as MediaItem[] | undefined) ?? []).some(
      (m) =>
        m.ocrStatus === "pending" ||
        m.ocrStatus === "processing" ||
        m.transcriptionStatus === "pending" ||
        m.transcriptionStatus === "processing",
    ) ?? false;
  useEffect(() => {
    if (!hasInFlightExtraction) return;
    const id = setInterval(() => void contentQuery.refetch(), 5000);
    return (): void => clearInterval(id);
  }, [hasInFlightExtraction, contentQuery]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("preview");
  const [addingFiles, setAddingFiles] = useState(false);
  const [replacingOrder, setReplacingOrder] = useState<number | null>(null);
  const [extractingOrder, setExtractingOrder] = useState<number | null>(null);
  const [transcribingOrder, setTranscribingOrder] = useState<number | null>(null);
  const addFilesRef = useRef<HTMLInputElement>(null);

  async function handleExtractText(order: number): Promise<void> {
    setExtractingOrder(order);
    try {
      const res = await fetch(`/api/creator-content/${id}/retry-ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order }),
      });
      const data = (await res.json()) as
        | { success: true; data: { model: string } }
        | { success: false; error?: { message: string; code?: string } };
      if (!res.ok || !data.success) {
        toast.error(
          !data.success ? (data.error?.message ?? "Extraction failed") : "Extraction failed",
        );
      } else {
        toast.success(
          `Extraction queued (${data.data.model}). Tutor will refresh after it completes.`,
        );
        void contentQuery.refetch();
      }
    } finally {
      setExtractingOrder(null);
    }
  }

  async function handleTranscribe(order: number): Promise<void> {
    setTranscribingOrder(order);
    try {
      const res = await fetch(`/api/creator-content/${id}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order }),
      });
      const data = (await res.json()) as
        | { success: true; data: { model: string } }
        | { success: false; error?: { message: string; code?: string } };
      if (!res.ok || !data.success) {
        toast.error(
          !data.success ? (data.error?.message ?? "Transcription failed") : "Transcription failed",
        );
      } else {
        toast.success(
          `Transcription queued (${data.data.model}). Tutor will refresh after it completes.`,
        );
        void contentQuery.refetch();
      }
    } finally {
      setTranscribingOrder(null);
    }
  }

  useEffect(() => {
    if (content) {
      setTitle(content.title);
      setDescription(content.description ?? "");
      setBody(content.body ?? "");
    }
  }, [content]);

  const updateMutation = trpc.creatorContent.update.useMutation({
    onSuccess: () => {
      toast.success("Content updated");
      void contentQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const togglePublishMutation = trpc.creatorContent.togglePublish.useMutation({
    onSuccess: (data) => {
      toast.success(data.isPublished ? "Published!" : "Unpublished");
      void contentQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMediaMutation = trpc.creatorContent.removeMedia.useMutation({
    onSuccess: () => {
      toast.success("File removed");
      void contentQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (contentQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }
  if (contentQuery.error || !content) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {contentQuery.error?.message ?? "Content not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const mediaItems = (content.mediaItems as MediaItem[] | undefined) ?? [];
  const imageUrls = mediaItems.filter((i) => i.type === "image").map((i) => i.url);
  const meta = (content.metadata as Record<string, unknown> | null) ?? {};
  const isHandwritten = (meta as { handwritten?: boolean }).handwritten === true;
  const imageMediaItems = mediaItems.filter((m) => m.type === "image");
  const nonImageMediaItems = mediaItems.filter((m) => m.type !== "image");

  async function handleReplace(order: number, file: File): Promise<void> {
    setReplacingOrder(order);
    try {
      await removeMediaMutation.mutateAsync({ contentId: id, order });
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch(`/api/creator-content/${id}/add-media`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!res.ok || !data.success) {
        toast.error(data.error?.message ?? "Failed to replace");
      } else {
        toast.success("File replaced");
        void contentQuery.refetch();
      }
    } finally {
      setReplacingOrder(null);
    }
  }

  async function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setAddingFiles(true);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      const res = await fetch(`/api/creator-content/${id}/add-media`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!res.ok || !data.success) {
        toast.error(data.error?.message ?? "Failed");
      } else {
        toast.success(`${files.length} file${files.length !== 1 ? "s" : ""} added`);
        void contentQuery.refetch();
      }
    } finally {
      setAddingFiles(false);
      if (addFilesRef.current) addFilesRef.current.value = "";
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {lightboxIndex !== null && imageUrls.length > 0 && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <div className="flex items-center gap-4">
        <Link href="/creator/content">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{content.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {content.contentType}
            </Badge>
            {mediaItems.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {mediaItems.length} file{mediaItems.length !== 1 ? "s" : ""}
              </Badge>
            )}
            <Badge variant={content.isPublished ? "default" : "secondary"}>
              {content.isPublished ? "Published" : "Draft"}
            </Badge>
            <Badge variant="secondary">{content.reviewStatus}</Badge>
            <span className="text-muted-foreground ml-auto text-xs">
              {content.viewCount ?? 0} views · {new Date(content.createdAt).toLocaleDateString()}
            </span>
          </div>
          {content.subject && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <BookOpen className="size-3.5 shrink-0 text-violet-500" />
              <span className="text-muted-foreground text-sm">
                {[content.subject, content.topic].filter(Boolean).join(" › ")}
              </span>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          className="shrink-0 gap-2"
          disabled={togglePublishMutation.isPending}
          onClick={() => togglePublishMutation.mutate({ contentId: id })}
        >
          <Globe className="size-4" />
          {content.isPublished ? "Unpublish" : "Publish"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="preview" className="gap-1.5">
            <Eye className="size-3.5" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-1.5">
            <Pencil className="size-3.5" />
            Edit
          </TabsTrigger>
          <TabsTrigger value="ai-tutor" className="gap-1.5">
            <Sparkles className="size-3.5" />
            Ask AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4 space-y-4">
          {content.description && (
            <p className="text-muted-foreground text-sm">{content.description}</p>
          )}
          {mediaItems.length > 0 ? (
            <MediaPreview
              items={mediaItems}
              body={content.body}
              onOpenLightbox={setLightboxIndex}
            />
          ) : content.body ? (
            <div className="bg-card rounded-lg border p-6">
              <MarkdownRenderer content={content.body} />
            </div>
          ) : (
            <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center">
              <Eye className="mx-auto mb-2 size-8" />
              <p className="text-sm">No content to preview.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="edit" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title-edit">Title</Label>
                <Input id="title-edit" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc-edit">Description</Label>
                <textarea
                  id="desc-edit"
                  className="border-input bg-background flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {nonImageMediaItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {nonImageMediaItems.map((item, i) => (
                  <MediaItemEditor
                    key={`${item.url}-${i}`}
                    item={item}
                    onRemove={() => {
                      if (confirm(`Remove "${item.fileName}"?`)) {
                        removeMediaMutation.mutate({ contentId: id, order: item.order });
                      }
                    }}
                    onReplace={(file) => void handleReplace(item.order, file)}
                    replacing={replacingOrder === item.order}
                    onExtractText={
                      item.type === "document"
                        ? (): void => void handleExtractText(item.order)
                        : undefined
                    }
                    extracting={extractingOrder === item.order}
                    onTranscribe={
                      item.type === "audio" || item.type === "video"
                        ? (): void => void handleTranscribe(item.order)
                        : undefined
                    }
                    transcribing={transcribingOrder === item.order}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {imageMediaItems.length > 0 &&
            (isHandwritten ? (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="size-4" />
                  Images ({imageMediaItems.length})
                  <Badge variant="secondary" className="text-[10px]">
                    Handwritten OCR
                  </Badge>
                </h3>
                {imageMediaItems.map((item, i) => (
                  <ImageOcrEditor
                    key={`${item.url}-${i}`}
                    contentId={id}
                    item={{
                      url: item.url,
                      fileName: item.fileName,
                      order: item.order,
                      extractedText: item.extractedText,
                      ocrStatus: item.ocrStatus,
                      ocrModel: item.ocrModel,
                      ocrError: item.ocrError,
                    }}
                    onRemove={() => {
                      if (confirm(`Remove "${item.fileName}"?`)) {
                        removeMediaMutation.mutate({ contentId: id, order: item.order });
                      }
                    }}
                    onReplace={(file) => void handleReplace(item.order, file)}
                    onOpenLightbox={() =>
                      setLightboxIndex(imageMediaItems.findIndex((m) => m.order === item.order))
                    }
                    onSaved={() => void contentQuery.refetch()}
                    replacing={replacingOrder === item.order}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Images</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {imageMediaItems.map((item, i) => (
                    <MediaItemEditor
                      key={`${item.url}-${i}`}
                      item={item}
                      onRemove={() => {
                        if (confirm(`Remove "${item.fileName}"?`)) {
                          removeMediaMutation.mutate({ contentId: id, order: item.order });
                        }
                      }}
                      onReplace={(file) => void handleReplace(item.order, file)}
                      replacing={replacingOrder === item.order}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}

          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <input
              ref={addFilesRef}
              type="file"
              className="hidden"
              accept="video/*,audio/*,image/*,.pdf,.docx,.pptx"
              multiple
              onChange={handleAddFiles}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={addingFiles}
              onClick={() => addFilesRef.current?.click()}
            >
              {addingFiles ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {addingFiles ? "Uploading…" : "Add More Files"}
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">Video, audio, images, documents</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Text Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[200px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Text notes, explanations (Markdown supported)…"
              />
            </CardContent>
          </Card>

          {((): React.ReactElement => {
            const detailsDirty =
              title.trim() !== content.title ||
              (description.trim() || "") !== (content.description ?? "") ||
              (body.trim() || "") !== (content.body ?? "");
            const saveBlocked =
              updateMutation.isPending || hasInFlightOcr || addingFiles || replacingOrder !== null;
            const saveDisabled = !detailsDirty || saveBlocked;
            return (
              <Button
                onClick={() =>
                  updateMutation.mutate({
                    contentId: id,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    body: body.trim() || undefined,
                  })
                }
                disabled={saveDisabled}
                className="gap-2"
                title={
                  hasInFlightOcr
                    ? "Wait for OCR to finish before saving"
                    : addingFiles
                      ? "Wait for uploads to finish"
                      : replacingOrder !== null
                        ? "Wait for replacement to finish"
                        : !detailsDirty
                          ? "No changes to save"
                          : undefined
                }
              >
                {updateMutation.isPending || hasInFlightOcr ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {hasInFlightOcr ? "Waiting for OCR…" : "Save Changes"}
              </Button>
            );
          })()}
        </TabsContent>

        <TabsContent value="ai-tutor" className="mt-4 space-y-4">
          {((): React.ReactElement => {
            // Per-content tutor needs a classroom for membership scoping. Use
            // the first assigned classroom; surface a hint if none yet.
            const classroomIds = Array.isArray(content.assignedClassrooms)
              ? (content.assignedClassrooms as string[])
              : [];
            if (classroomIds.length === 0) {
              return (
                <Card>
                  <CardContent className="text-muted-foreground py-8 text-center text-sm">
                    <Sparkles className="mx-auto mb-2 size-6" />
                    <p className="font-medium">Assign this content to a classroom first.</p>
                    <p className="mt-1 text-xs">
                      The AI tutor scopes retrieval by classroom membership, so this content needs
                      to be in at least one classroom before students (or you) can ask questions
                      about it.
                    </p>
                  </CardContent>
                </Card>
              );
            }
            return (
              <>
                {classroomIds.length > 1 && (
                  <p className="text-muted-foreground text-xs">
                    Answering within the first of {classroomIds.length} assigned classrooms.
                    Retrieval is restricted to this content piece regardless.
                  </p>
                )}
                <AiTutorChat
                  classroomId={classroomIds[0]!}
                  isTeacher
                  contentId={id}
                  contentTitle={content.title}
                />
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
