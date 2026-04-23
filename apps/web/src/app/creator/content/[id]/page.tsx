"use client";

/**
 * Content detail / edit page — structural port of PadVik's
 * /dashboard/creator/content/[id] with ExamForge's ids and schema.
 *
 * Tabs: Preview (media + body) · Edit (details + per-file ops + add-more).
 * Images open in a fullscreen lightbox with pan/zoom.
 *
 * PadVik's OCR side-by-side editor is simplified to "show extracted text
 * if present" — the full OCR pipeline lands in a later phase.
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
  ZoomIn,
  BookOpen,
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
import { trpc } from "@/lib/trpc";

type MediaType = "video" | "audio" | "image" | "document";

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

function MediaPreview({
  items,
  body,
  onOpenLightbox,
}: {
  items: MediaItem[];
  body: string | null;
  onOpenLightbox: (idx: number) => void;
}): React.ReactElement {
  const imageItems = items.filter((i) => i.type === "image");

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={`${item.url}-${i}`} className="bg-card overflow-hidden rounded-lg border">
          {item.type === "video" && (
            <>
              <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
                <FileVideo className="size-4 text-blue-500" />
                <span className="text-sm font-medium">Video</span>
                <span className="text-muted-foreground ml-auto text-xs">{item.fileName}</span>
              </div>
              <div className="aspect-video bg-black">
                <video src={item.url} controls className="h-full w-full" />
              </div>
            </>
          )}
          {item.type === "audio" && (
            <>
              <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
                <FileAudio className="size-4 text-green-500" />
                <span className="text-sm font-medium">Audio</span>
                <span className="text-muted-foreground ml-auto text-xs">{item.fileName}</span>
              </div>
              <div className="p-4">
                <audio src={item.url} controls className="w-full" />
              </div>
            </>
          )}
          {item.type === "image" && (
            <>
              <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
                <ImageIcon className="size-4 text-amber-500" />
                <span className="text-sm font-medium">Image</span>
                <span className="text-muted-foreground ml-auto text-xs">{item.fileName}</span>
              </div>
              <div
                className="group relative flex cursor-pointer justify-center p-4"
                onClick={() => onOpenLightbox(imageItems.indexOf(item))}
              >
                <img
                  src={item.url}
                  alt=""
                  className="max-h-[400px] rounded border object-contain"
                />
                <div className="absolute inset-0 flex items-center justify-center rounded bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomIn className="size-8 text-white drop-shadow-lg" />
                </div>
              </div>
              {item.extractedText && (
                <div className="border-t p-4">
                  <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    Extracted text
                  </div>
                  <MarkdownRenderer content={item.extractedText} />
                </div>
              )}
            </>
          )}
          {item.type === "document" && (
            <>
              <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-red-500" />
                  <span className="text-sm font-medium">Document</span>
                </div>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    <Download className="size-3" />
                    Open
                  </Button>
                </a>
              </div>
              {item.mimeType === "application/pdf" ||
              item.fileName?.toLowerCase().endsWith(".pdf") ? (
                <div className="bg-muted/10 flex flex-col items-center gap-4 p-8">
                  <FileText className="size-16 text-red-400" />
                  <p className="text-sm font-medium">{item.fileName}</p>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" className="gap-1.5">
                      <Eye className="size-3.5" />
                      View PDF
                    </Button>
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 p-6">
                  <FileText className="text-muted-foreground size-10" />
                  <p className="text-sm">{item.fileName}</p>
                  <p className="text-muted-foreground text-xs">{formatSize(item.fileSize)}</p>
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {body && (
        <div className="bg-card rounded-lg border">
          <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
            <FileText className="text-muted-foreground size-4" />
            <span className="text-sm font-medium">Text Notes</span>
          </div>
          <div className="max-h-[500px] overflow-y-auto p-6">
            <MarkdownRenderer content={body} />
          </div>
        </div>
      )}
    </div>
  );
}

function MediaItemEditor({
  item,
  onRemove,
  onReplace,
  replacing,
}: {
  item: MediaItem;
  onRemove: () => void;
  onReplace: (file: File) => void;
  replacing?: boolean;
}): React.ReactElement {
  const replaceRef = useRef<HTMLInputElement>(null);
  return (
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
  );
}

export default function ContentDetailPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);

  const contentQuery = trpc.creatorContent.byId.useQuery({ contentId: id });
  const content = contentQuery.data ?? null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("preview");
  const [addingFiles, setAddingFiles] = useState(false);
  const [replacingOrder, setReplacingOrder] = useState<number | null>(null);
  const addFilesRef = useRef<HTMLInputElement>(null);

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

          {mediaItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {mediaItems.map((item, i) => (
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
          )}

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

          <Button
            onClick={() =>
              updateMutation.mutate({
                contentId: id,
                title: title.trim(),
                description: description.trim() || undefined,
                body: body.trim() || undefined,
              })
            }
            disabled={updateMutation.isPending}
            className="gap-2"
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Changes
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
