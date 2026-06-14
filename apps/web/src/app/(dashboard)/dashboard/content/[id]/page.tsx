"use client";

/**
 * Student-side content viewer — read-only rendering of a creator_content
 * item the caller has access to through an enrolled classroom.
 *
 * Access is enforced server-side via `classroom.getAssignedContentById`:
 * the caller must be an active member of a classroom this content is
 * assigned to, otherwise the query returns FORBIDDEN.
 *
 * The visual layout deliberately mirrors the creator detail page's
 * Preview tab — same MediaPreview component (video / audio / image with
 * side-by-side OCR / inline PDF) and same ImageLightbox integration — so
 * students see every file type the same way the creator does, minus the
 * editing controls and publish button.
 *
 * When the content is still OCR-processing (handwritten → text), the
 * query auto-refetches every 5 s so the extracted text lands without a
 * manual reload.
 */

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Eye, GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/content/markdown-renderer";
import { ImageLightbox } from "@/components/content/image-lightbox";
import { MediaPreview, type PreviewMediaItem } from "@/components/content/media-preview";
import { trpc } from "@/lib/trpc";

export default function StudentContentViewerPage(props: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(props.params);

  const contentQuery = trpc.classroom.getAssignedContentById.useQuery(
    { contentId: id },
    {
      // Don't retry FORBIDDEN/NOT_FOUND — those are stable errors, not
      // transient network failures. Retrying just delays the error message.
      retry: false,
    },
  );
  const content = contentQuery.data ?? null;

  // Auto-refetch while OCR is in flight so handwritten extracted text
  // appears without a reload — identical behaviour to the creator page.
  const mediaItems = (content?.mediaItems as PreviewMediaItem[] | undefined) ?? [];
  const hasInFlightOcr = mediaItems.some(
    (m) => m.ocrStatus === "pending" || m.ocrStatus === "processing",
  );
  useEffect(() => {
    if (!hasInFlightOcr) return;
    const timer = setInterval(() => void contentQuery.refetch(), 5000);
    return (): void => clearInterval(timer);
  }, [hasInFlightOcr, contentQuery]);

  // Record a view once per page visit. The ref guards against React 18's
  // double-mount-in-StrictMode + later refetches firing the effect again.
  // Server enforces access + skips the increment if the caller is the
  // content's own creator, so this is best-effort-safe regardless.
  const recordViewMutation = trpc.classroom.recordContentView.useMutation();
  const viewRecordedForIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!content) return;
    if (viewRecordedForIdRef.current === content.id) return;
    viewRecordedForIdRef.current = content.id;
    recordViewMutation.mutate({ contentId: content.id });
  }, [content, recordViewMutation]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (contentQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (contentQuery.error || !content) {
    // Tailor the copy to the tRPC error code so FORBIDDEN reads
    // differently from NOT_FOUND.
    const code = contentQuery.error?.data?.code;
    const message =
      code === "FORBIDDEN"
        ? "You don't have access to this content."
        : code === "NOT_FOUND"
          ? "This content no longer exists."
          : (contentQuery.error?.message ?? "Unable to load content.");
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/dashboard">
            <ArrowLeft className="mr-1 size-4" />
            Dashboard
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-sm">
            <Eye className="text-muted-foreground mx-auto mb-3 size-8" />
            <p className="font-medium">{message}</p>
            {code === "FORBIDDEN" && (
              <p className="text-muted-foreground mt-1 text-xs">
                Ask your teacher to assign this to a classroom you're enrolled in.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const imageUrls = mediaItems.filter((i) => i.type === "image").map((i) => i.url);
  const backHref = content.classroom?.id
    ? `/dashboard/classrooms/${content.classroom.id}`
    : "/dashboard/classrooms";
  const backLabel = content.classroom?.name ? content.classroom.name : "My Classrooms";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {lightboxIndex !== null && imageUrls.length > 0 && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Header — mirrors the creator detail page's header structure, but
          with a back link that returns to the classroom (not the creator's
          content list) and no publish/edit controls. */}
      <div className="flex items-center gap-4">
        <Link href={backHref as "/"}>
          <Button variant="ghost" size="icon" title={`Back to ${backLabel}`}>
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
            {content.classroom?.name && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <GraduationCap className="size-3" />
                {content.classroom.name}
              </Badge>
            )}
            <span className="text-muted-foreground ml-auto text-xs">
              {content.viewCount ?? 0} views · {new Date(content.createdAt).toLocaleDateString()}
            </span>
          </div>
          {(content.subject || content.creatorDisplayName) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {content.subject && (
                <div className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5 shrink-0 text-violet-500" />
                  <span className="text-muted-foreground text-sm">
                    {[content.subject, content.topic].filter(Boolean).join(" › ")}
                  </span>
                </div>
              )}
              {content.creatorDisplayName && (
                <span className="text-muted-foreground text-sm">
                  by{" "}
                  <span className="text-foreground font-medium">{content.creatorDisplayName}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {content.description && (
        <p className="text-muted-foreground text-sm">{content.description}</p>
      )}

      {/* Body — same three-state render as the creator's Preview tab:
          1. mediaItems → MediaPreview (handles every file type)
          2. body only → markdown card
          3. nothing → friendly empty state */}
      {mediaItems.length > 0 ? (
        <MediaPreview items={mediaItems} body={content.body} onOpenLightbox={setLightboxIndex} />
      ) : content.body ? (
        <div className="bg-card rounded-lg border p-6">
          <MarkdownRenderer content={content.body} />
        </div>
      ) : (
        <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center">
          <Eye className="mx-auto mb-2 size-8" />
          <p className="text-sm">No content to preview yet.</p>
        </div>
      )}
    </div>
  );
}
