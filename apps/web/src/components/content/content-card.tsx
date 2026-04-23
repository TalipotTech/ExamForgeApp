"use client";

/**
 * Shared card component for creator content tiles.
 *
 * Used on:
 *   - Creator Hub / Recent Contents  → with a Publish-draft action
 *   - Student Dashboard / Recent Contents (from classrooms) → read-only
 *
 * The card always shows:
 *   - 16:9 preview tile on top (video with hover-autoplay, image with a
 *     subtle zoom, or a typed-gradient icon placeholder)
 *   - Floating content-type badge pinned to the preview's top-left
 *   - Optional floating "context badge" on the top-right (used by the
 *     student view to show the classroom name)
 *   - Title (line-clamp-2), meta row (state/views/time/creator), footer
 *     with primary + optional secondary action buttons
 *
 * Video hover preview details:
 *   - `muted` + `playsInline` are REQUIRED for programmatic autoplay
 *     across Chrome/Safari.
 *   - `preload="metadata"` keeps initial page load light — the video body
 *     only loads when the user hovers.
 *   - On leave we pause + rewind to 0 so the next hover restarts the clip.
 *   - `.play()` returns a promise that rejects if the browser blocks
 *     autoplay (e.g. unmuted). Since we're `muted`, the catch is defensive.
 */

import Link from "next/link";
import { useRef } from "react";
import { FileText, FileVideo, FileAudio, Image as ImageIcon, Play, Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Minimal shape of the media-item entries the upload routes write into
 *  `creator_content.metadata.mediaItems`. Defensive against older rows that
 *  may be missing some fields. */
export type CardMediaItem = {
  type: "video" | "audio" | "image" | "document";
  url: string;
  fileName?: string;
  mimeType?: string;
  order: number;
};

/** The content row shape the card consumes. Mirrors what both the creator's
 *  `myContent` and the student's `classroom.myAssignedContent` /
 *  `classroom.listAssignedContent` endpoints return. All fields are
 *  optional-friendly so a partial row still renders. */
export type ContentCardData = {
  id: string;
  title: string;
  contentType: string;
  isPublished: boolean;
  viewCount?: number | null;
  createdAt: string | Date;
  thumbnailUrl?: string | null;
  metadata?: unknown;
  subject?: string | null;
  topic?: string | null;
  creatorDisplayName?: string | null;
};

/** Extract media items from the JSONB metadata blob. Sorted by `order` so
 *  the first video / image is deterministic. Returns [] on malformed input. */
export function readCardMediaItems(meta: unknown): CardMediaItem[] {
  if (!meta || typeof meta !== "object") return [];
  const items = (meta as { mediaItems?: unknown }).mediaItems;
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (m): m is CardMediaItem =>
        m != null &&
        typeof m === "object" &&
        typeof (m as CardMediaItem).url === "string" &&
        typeof (m as CardMediaItem).type === "string",
    )
    .sort((a, b) => a.order - b.order);
}

export function ContentTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}): React.ReactElement {
  const cls = className ?? "size-4";
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

export function timeAgo(input: string | Date | null | undefined): string {
  if (!input) return "";
  const then = typeof input === "string" ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

function VideoHoverPreview({
  src,
  posterCandidate,
}: {
  src: string;
  posterCandidate?: string;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={() => {
        const v = videoRef.current;
        if (!v) return;
        void v.play().catch(() => undefined);
      }}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (!v) return;
        v.pause();
        v.currentTime = 0;
      }}
    >
      <video
        ref={videoRef}
        src={src}
        {...(posterCandidate ? { poster: posterCandidate } : {})}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-100 transition-opacity group-hover:opacity-0">
        <div className="flex size-9 items-center justify-center rounded-full bg-white/90 shadow">
          <Play className="size-4 translate-x-0.5 text-slate-900" fill="currentColor" />
        </div>
      </div>
    </div>
  );
}

function ImagePreview({ src }: { src: string }): React.ReactElement {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

type PlaceholderKind = "audio" | "document" | "note" | "other";

function PlaceholderPreview({ type }: { type: PlaceholderKind }): React.ReactElement {
  const themes: Record<
    PlaceholderKind,
    { gradient: string; icon: React.ComponentType<{ className?: string }>; label: string }
  > = {
    audio: {
      gradient: "from-emerald-500/20 via-emerald-500/10 to-transparent",
      icon: Music2,
      label: "Audio",
    },
    document: {
      gradient: "from-red-500/20 via-red-500/10 to-transparent",
      icon: FileText,
      label: "Document",
    },
    note: {
      gradient: "from-violet-500/20 via-violet-500/10 to-transparent",
      icon: FileText,
      label: "Notes",
    },
    other: {
      gradient: "from-slate-500/20 via-slate-500/10 to-transparent",
      icon: FileText,
      label: "File",
    },
  };
  const theme = themes[type];
  const Icon = theme.icon;
  return (
    <div
      className={`from-muted to-muted/30 bg-gradient-to-br ${theme.gradient} flex h-full w-full flex-col items-center justify-center gap-2`}
    >
      <Icon className="text-muted-foreground size-10" />
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        {theme.label}
      </span>
    </div>
  );
}

/**
 * The preview tile (video/image/placeholder). Exported so callers can mount
 * it in other contexts — e.g. a hero section — without the full card chrome.
 */
export function ContentPreview({ content }: { content: ContentCardData }): React.ReactElement {
  const mediaItems = readCardMediaItems(content.metadata);
  const firstVideo = mediaItems.find((m) => m.type === "video");
  const firstImage = mediaItems.find((m) => m.type === "image");
  // Prefer the denormalised thumbnailUrl (the upload route copies the first
  // image URL there). Fall back to scanning mediaItems so older rows still
  // render a preview.
  const imageUrl = content.thumbnailUrl ?? firstImage?.url ?? null;

  if (firstVideo) {
    return <VideoHoverPreview src={firstVideo.url} posterCandidate={imageUrl ?? undefined} />;
  }
  if (imageUrl) return <ImagePreview src={imageUrl} />;
  if (content.contentType === "audio") return <PlaceholderPreview type="audio" />;
  if (content.contentType === "note") return <PlaceholderPreview type="note" />;
  if (content.contentType === "document") return <PlaceholderPreview type="document" />;
  return <PlaceholderPreview type="other" />;
}

/**
 * The full card. `href` is where the entire preview + title link to.
 * `footer` is rendered at the bottom of the card so each caller can supply
 * its own action buttons (creator: Publish + Open; student: Open).
 * `contextBadge` renders in the preview's top-right corner — e.g. the
 * classroom this content is assigned to, for the student view.
 * `metaExtras` is rendered as extra chips in the meta row (after view count
 * and timestamp). Used e.g. to surface the creator's display name.
 */
export function ContentCard({
  content,
  href,
  footer,
  contextBadge,
  metaExtras,
  showPublishedBadge = true,
}: {
  content: ContentCardData;
  href: string;
  footer?: React.ReactNode;
  contextBadge?: React.ReactNode;
  metaExtras?: React.ReactNode;
  showPublishedBadge?: boolean;
}): React.ReactElement {
  // File count is derived from the media items parsed out of metadata —
  // callers don't need to pass it separately. Falls back to 0 for rows
  // without media (text-only notes).
  const fileCount = readCardMediaItems(content.metadata).length;
  const subjectTopic = [content.subject, content.topic].filter(Boolean).join(" › ");
  const hasSecondaryRow = Boolean(subjectTopic || content.creatorDisplayName);

  return (
    <div className="bg-card group flex flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md">
      <Link
        href={href as "/"}
        className="bg-muted relative block aspect-video overflow-hidden"
        title={content.title}
      >
        <ContentPreview content={content} />
        <div className="absolute left-2 top-2">
          <Badge
            variant="secondary"
            className="gap-1 border-white/20 bg-black/60 px-1.5 py-0 text-[9px] text-white backdrop-blur-sm"
          >
            <ContentTypeIcon type={content.contentType} className="size-3" />
            <span className="capitalize">{content.contentType}</span>
          </Badge>
        </div>
        {contextBadge && <div className="absolute right-2 top-2 max-w-[60%]">{contextBadge}</div>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          href={href as "/"}
          className="hover:text-primary line-clamp-2 text-sm font-medium leading-snug"
        >
          {content.title}
        </Link>
        {/* Primary meta row — state badge + counts + relative time. Kept at
            text-[10px] so multiple chips fit on one line on narrow cards. */}
        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[10px]">
          {showPublishedBadge && (
            <Badge
              variant={content.isPublished ? "default" : "secondary"}
              className="px-1 py-0 text-[9px]"
            >
              {content.isPublished ? "Published" : "Draft"}
            </Badge>
          )}
          {fileCount > 0 && (
            <span>
              {fileCount} file{fileCount !== 1 ? "s" : ""}
            </span>
          )}
          <span>
            {fileCount > 0 ? "· " : ""}
            {content.viewCount ?? 0} views
          </span>
          <span>· {timeAgo(content.createdAt)}</span>
          {metaExtras}
        </div>
        {/* Secondary meta row — subject › topic and "by {creator}". Only
            rendered when at least one of those exists so we don't leave a
            dead gap on cards without exam-tagging. Uses `line-clamp-1`
            with a `title` tooltip for the full value when truncated. */}
        {hasSecondaryRow && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
            {subjectTopic && (
              <span className="line-clamp-1 max-w-full" title={subjectTopic}>
                {subjectTopic}
              </span>
            )}
            {content.creatorDisplayName && (
              <span className="line-clamp-1 max-w-full" title={`by ${content.creatorDisplayName}`}>
                by <span className="text-foreground font-medium">{content.creatorDisplayName}</span>
              </span>
            )}
          </div>
        )}
        {footer && <div className="mt-auto flex items-center gap-1 pt-1">{footer}</div>}
      </div>
    </div>
  );
}
