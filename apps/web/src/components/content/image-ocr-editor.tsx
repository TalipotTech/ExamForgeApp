"use client";

/**
 * Side-by-side image + extracted-text editor for handwritten-note
 * creator content — structural port of PadVik's ImageOcrEditor.
 *
 *   ┌─────────────┬──────────────────────┐
 *   │  image      │  Visual / Markdown   │
 *   │  (click to  │  (toggleable)        │
 *   │  open       │  editable textarea   │
 *   │  lightbox)  │  in markdown mode    │
 *   └─────────────┴──────────────────────┘
 *
 * The "Visual" mode renders the markdown (with KaTeX math). "Markdown"
 * mode is a plain textarea the creator can edit directly — saved text
 * goes back through the `creatorContent.updateMediaText` tRPC mutation.
 *
 * OCR status badges + retry button are wired to the
 * `/api/creator-content/:id/retry-ocr` endpoint (requires
 * creators.ocr_enabled).
 */

import { useRef, useState } from "react";
import {
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  ZoomIn,
  Save,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/content/markdown-renderer";
import { trpc } from "@/lib/trpc";

type OcrModel = "gemini-2.5-pro" | "gemini-2.5-flash" | "claude-sonnet-4-6";
type OcrStatus = "pending" | "processing" | "completed" | "failed";

export type ImageMediaItem = {
  url: string;
  fileName: string;
  order: number;
  extractedText?: string;
  ocrStatus?: OcrStatus;
  ocrModel?: string;
  ocrError?: string;
};

function StatusBadge({ status }: { status?: OcrStatus }): React.ReactElement | null {
  if (!status) return null;
  if (status === "pending")
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <Clock className="size-3" />
        pending
      </Badge>
    );
  if (status === "processing")
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <Loader2 className="size-3 animate-spin" />
        processing
      </Badge>
    );
  if (status === "completed")
    return (
      <Badge variant="default" className="gap-1 text-[10px]">
        <CheckCircle2 className="size-3" />
        OCR ok
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive" className="gap-1 text-[10px]">
        <XCircle className="size-3" />
        OCR failed
      </Badge>
    );
  return null;
}

export function ImageOcrEditor({
  contentId,
  item,
  onRemove,
  onReplace,
  onOpenLightbox,
  onSaved,
  replacing,
}: {
  contentId: string;
  item: ImageMediaItem;
  onRemove: () => void;
  onReplace: (file: File) => void;
  onOpenLightbox: () => void;
  onSaved: () => void;
  replacing?: boolean;
}): React.ReactElement {
  const replaceRef = useRef<HTMLInputElement>(null);
  const [editMode, setEditMode] = useState<"visual" | "markdown">("visual");
  const [draft, setDraft] = useState<string>(item.extractedText ?? "");
  const [dirty, setDirty] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryModel, setRetryModel] = useState<OcrModel>(
    (item.ocrModel as OcrModel) ?? "gemini-2.5-pro",
  );

  // Sync draft when the parent's extractedText changes (e.g. after OCR
  // completes or the user retries). Only overwrite if the user hasn't
  // edited locally.
  if (!dirty && (item.extractedText ?? "") !== draft) {
    setDraft(item.extractedText ?? "");
  }

  const saveMutation = trpc.creatorContent.updateMediaText.useMutation({
    onSuccess: () => {
      toast.success("Text saved");
      setDirty(false);
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleRetry(): Promise<void> {
    setRetrying(true);
    try {
      const res = await fetch(`/api/creator-content/${contentId}/retry-ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order: item.order, model: retryModel }),
      });
      const data = (await res.json()) as
        | { success: true; data: { model: string } }
        | { success: false; error?: { message: string } };
      if (!res.ok || !data.success) {
        toast.error(!data.success ? (data.error?.message ?? "Retry failed") : "Retry failed");
      } else {
        toast.success(`OCR re-queued with ${data.data.model}`);
        onSaved();
      }
    } finally {
      setRetrying(false);
    }
  }

  // Two separate concerns:
  //   - `isReplacing` dims the whole card (file swap + re-processing is
  //     a destructive operation, we don't want stray edits during it)
  //   - `ocrInFlight` disables only the Re-run OCR + Save text buttons
  //     so the user can still flip Visual/Markdown modes and edit the
  //     textarea while the worker is running. The key change: the
  //     button's disabled state follows item.ocrStatus, which stays
  //     in pending/processing until the worker reaches a terminal
  //     state (completed or failed) — so retry failures DO re-enable
  //     the button for another attempt.
  const ocrInFlight = item.ocrStatus === "pending" || item.ocrStatus === "processing";
  const retryDisabled = replacing || retrying || ocrInFlight;
  const saveDisabled = !dirty || saveMutation.isPending || replacing || ocrInFlight;
  const isReplacing = replacing;

  return (
    <div
      className={`overflow-hidden rounded-lg border transition-opacity ${
        isReplacing ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="bg-muted/30 flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {replacing ? (
            <Loader2 className="size-3.5 animate-spin text-violet-500" />
          ) : (
            <ImageIcon className="size-3.5 text-amber-500" />
          )}
          <span className="max-w-[240px] truncate text-xs font-medium">
            {replacing ? "Replacing & re-processing OCR…" : item.fileName}
          </span>
          <StatusBadge status={item.ocrStatus} />
        </div>
        <div className="flex items-center gap-1">
          {item.extractedText && !replacing && (
            <>
              <Button
                type="button"
                variant={editMode === "visual" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setEditMode("visual")}
              >
                Visual
              </Button>
              <Button
                type="button"
                variant={editMode === "markdown" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setEditMode("markdown")}
              >
                Markdown
              </Button>
            </>
          )}
          <input
            ref={replaceRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) onReplace(e.target.files[0]);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            title="Open in lightbox (zoom / rotate / prev-next)"
            onClick={onOpenLightbox}
            disabled={isReplacing}
          >
            <ZoomIn className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            title="Replace image"
            onClick={() => replaceRef.current?.click()}
            disabled={isReplacing || ocrInFlight}
          >
            <RefreshCw className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive size-6"
            title="Remove"
            onClick={onRemove}
            disabled={isReplacing || ocrInFlight}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {(replacing || retrying) && (
        <div className="bg-muted h-1 overflow-hidden">
          <div className="h-full w-full animate-pulse bg-violet-500" />
        </div>
      )}

      {/* Content: image left, text right */}
      <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
        <div className="bg-muted/10 flex flex-col border-r p-3">
          <div
            className="group relative flex flex-1 cursor-pointer items-start justify-center"
            onClick={onOpenLightbox}
          >
            <img src={item.url} alt="" className="max-h-[300px] rounded border object-contain" />
            <div className="absolute inset-0 flex items-center justify-center rounded bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomIn className="size-8 text-white drop-shadow-lg" />
            </div>
          </div>
        </div>

        <div className="flex flex-col p-3">
          {item.extractedText ? (
            editMode === "visual" ? (
              <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md px-2 py-2">
                <MarkdownRenderer content={draft} />
              </div>
            ) : (
              <textarea
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-[200px] flex-1 resize-y rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDirty(true);
                }}
              />
            )
          ) : item.ocrStatus === "failed" ? (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-sm">
              <XCircle className="size-5 text-red-500" />
              <span>OCR failed</span>
              {item.ocrError && (
                <span className="text-muted-foreground max-w-sm text-center text-xs">
                  {item.ocrError}
                </span>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm italic">
              {replacing || retrying || item.ocrStatus === "processing"
                ? "Processing OCR…"
                : item.ocrStatus === "pending"
                  ? "Queued for OCR…"
                  : "No text extracted"}
            </div>
          )}
        </div>
      </div>

      {/* Footer — save + retry */}
      <div className="bg-muted/20 flex items-center justify-between gap-2 border-t px-3 py-2">
        <div className="flex items-center gap-2">
          <Select
            value={retryModel}
            onValueChange={(v) => setRetryModel(v as OcrModel)}
            disabled={retryDisabled}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
              <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
              <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => void handleRetry()}
            disabled={retryDisabled}
          >
            {retrying || ocrInFlight ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Re-run OCR
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={saveDisabled}
          onClick={() =>
            saveMutation.mutate({
              contentId,
              order: item.order,
              extractedText: draft,
            })
          }
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          Save text
        </Button>
      </div>
    </div>
  );
}
