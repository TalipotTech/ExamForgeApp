"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Upload,
  Loader2,
  Edit,
  Trash2,
  Globe,
  BookOpen,
  FileText,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

function ContentTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}): React.ReactElement {
  const cls = className ?? "h-5 w-5";
  switch (type) {
    case "video":
      return <FileVideo className={cls} />;
    case "audio":
      return <FileAudio className={cls} />;
    case "image":
      return <ImageIcon className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

export default function CreatorContentPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const listQuery = trpc.creatorContent.myContent.useQuery({
    page,
    limit: 20,
  });

  const togglePublishMutation = trpc.creatorContent.togglePublish.useMutation({
    onSuccess: (data) => {
      toast.success(data.isPublished ? "Published" : "Unpublished");
      void listQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.creatorContent.delete.useMutation({
    onSuccess: () => {
      toast.success("Content deleted");
      void listQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const items = listQuery.data?.items ?? [];
  const totalPages = listQuery.data?.pagination.totalPages ?? 1;
  const isLoading = listQuery.isLoading;
  const gateMsg = listQuery.error?.message.includes("FEATURE_DISABLED")
    ? "The creators ecosystem is not yet enabled."
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Content</h1>
        <Link href="/creator/content/upload">
          <Button className="gap-2">
            <Upload className="size-4" />
            Upload New
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
        </div>
      ) : gateMsg ? (
        <Card>
          <CardContent className="py-6 text-center text-sm">{gateMsg}</CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
            <p className="text-muted-foreground">No content uploaded yet.</p>
            <Link href="/creator/content/upload">
              <Button variant="outline" className="gap-2">
                <Upload className="size-4" />
                Upload Your First Content
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const meta =
              (item.metadata as {
                mediaItems?: { type: string }[];
                handwritten?: boolean;
              } | null) ?? null;
            const fileCount = meta?.mediaItems?.length ?? 0;
            return (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="bg-muted/50 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ContentTypeIcon
                        type={item.contentType}
                        className="text-muted-foreground size-6"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/creator/content/${item.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="h-5 py-0 text-[10px] capitalize">
                        {item.contentType}
                      </Badge>
                      <Badge
                        variant={item.isPublished ? "default" : "secondary"}
                        className="h-5 py-0 text-[10px]"
                      >
                        {item.isPublished ? "Published" : "Draft"}
                      </Badge>
                      <Badge
                        variant={
                          item.reviewStatus === "approved"
                            ? "default"
                            : item.reviewStatus === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                        className="h-5 py-0 text-[10px]"
                      >
                        {item.reviewStatus}
                      </Badge>
                      {fileCount > 0 && (
                        <Badge variant="outline" className="h-5 py-0 text-[10px]">
                          {fileCount} file{fileCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                      <span className="text-muted-foreground text-[10px]">
                        {item.viewCount ?? 0} views · {item.likeCount ?? 0} likes
                      </span>
                    </div>
                    {item.subject && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <BookOpen className="text-muted-foreground size-3 shrink-0" />
                        <span className="text-muted-foreground text-[11px]">
                          {item.subject}
                          {item.topic ? ` · ${item.topic}` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-muted-foreground text-xs">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={togglePublishMutation.isPending}
                        onClick={() => togglePublishMutation.mutate({ contentId: item.id })}
                        title={item.isPublished ? "Unpublish" : "Publish"}
                      >
                        <Globe className="size-3.5" />
                      </Button>
                      <Link href={`/creator/content/${item.id}`}>
                        <Button variant="ghost" size="icon" className="size-7" title="Edit">
                          <Edit className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive size-7"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm("Delete this content? This cannot be undone.")) {
                            deleteMutation.mutate({ contentId: item.id });
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
