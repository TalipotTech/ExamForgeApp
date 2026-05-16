"use client";

/**
 * Read-only preview of a creator_content item's media + body.
 *
 * Used on both sides of the platform:
 *   - Creator detail page (`/creator/content/[id]`)  Preview tab
 *   - Student viewer page (`/dashboard/content/[id]`)  — entire page
 *
 * Renders each media item based on type:
 *   - video → full <video controls>
 *   - audio → <audio controls> with a header
 *   - image → click-to-lightbox; if OCR has extracted text, show the text
 *     side-by-side with the image
 *   - document → inline PdfViewer when the MIME is `application/pdf` (or
 *     the filename ends in `.pdf`), otherwise a compact file card with a
 *     "Download" link
 *
 * The body (markdown) renders below the media as a "Text Notes" section.
 *
 * This component is purely presentational — it does NOT mutate data, so the
 * student viewer can use it unchanged. The creator detail page's Edit tab
 * has its own per-file editors elsewhere.
 */

import { FileText, FileVideo, FileAudio, Image as ImageIcon, Download, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/content/markdown-renderer";
import { PdfViewer } from "@/components/content/pdf-viewer";

export type PreviewMediaType = "video" | "audio" | "image" | "document";
export type PreviewOcrStatus = "pending" | "processing" | "completed" | "failed";

export type PreviewMediaItem = {
  type: PreviewMediaType;
  url: string;
  fileUploadId?: string | null;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  order: number;
  extractedText?: string;
  duration?: number;
  ocrStatus?: PreviewOcrStatus;
  ocrModel?: string;
  ocrError?: string;
};

function formatSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreview({
  items,
  body,
  onOpenLightbox,
}: {
  items: PreviewMediaItem[];
  body: string | null;
  onOpenLightbox: (idx: number) => void;
}): React.ReactElement {
  // imageItems is used to translate a per-item click into the lightbox's
  // flat-index (it only knows about images, not the full mediaItems list).
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => onOpenLightbox(imageItems.indexOf(item))}
                >
                  <ZoomIn className="size-3.5" />
                  Open
                </Button>
              </div>
              {item.extractedText ? (
                <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
                  <div
                    className="bg-muted/10 group relative flex cursor-pointer items-start justify-center border-r p-4"
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
                  <div className="max-h-[500px] overflow-y-auto p-4">
                    <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                      Extracted text
                    </div>
                    <MarkdownRenderer content={item.extractedText} />
                  </div>
                </div>
              ) : (
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
                <PdfViewer url={item.url} fileName={item.fileName} />
              ) : (
                <div className="flex flex-col items-center gap-2 p-6">
                  <FileText className="text-muted-foreground size-10" />
                  <p className="text-sm">{item.fileName}</p>
                  <p className="text-muted-foreground text-xs">{formatSize(item.fileSize)}</p>
                </div>
              )}
              {item.extractedText && item.extractedText.trim().length > 0 && (
                <div className="bg-muted/10 border-t p-4">
                  <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-medium uppercase">
                    <span>Extracted text</span>
                    {item.ocrModel && (
                      <span className="font-normal normal-case">via {item.ocrModel}</span>
                    )}
                  </div>
                  <div className="max-h-[500px] overflow-y-auto">
                    <MarkdownRenderer content={item.extractedText} />
                  </div>
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
