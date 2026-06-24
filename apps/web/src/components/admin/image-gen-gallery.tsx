"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

function resolveImageUrl(url: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/$/, "");
  return `${base}${url}`;
}

export function ImageGenGallery(): React.ReactElement {
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);
  const { data, isLoading, refetch, isRefetching } = trpc.imageGeneration.getRecent.useQuery(
    { limit: 24 },
    { staleTime: 30_000 },
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">🖼️ Recent Images</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
          {isRefetching ? "Refreshing…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No images yet. Generate one above or run a topic sync.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setViewer({ src: resolveImageUrl(img.cdnUrl), caption: img.prompt })}
                className="group block overflow-hidden rounded-md border text-left"
                title={img.prompt}
              >
                <img
                  src={resolveImageUrl(img.cdnUrl)}
                  alt={img.prompt}
                  loading="lazy"
                  className="bg-muted aspect-video w-full object-cover transition-opacity group-hover:opacity-90"
                />
                <div className="text-muted-foreground space-y-0.5 p-2 text-xs">
                  <div className="truncate font-medium" title={img.purpose}>
                    {img.purpose}
                  </div>
                  <div className="flex justify-between">
                    <span className="truncate">{img.model}</span>
                    <span>${img.costUsd.toFixed(3)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <ImageLightbox
        open={!!viewer}
        src={viewer?.src ?? ""}
        caption={viewer?.caption}
        alt={viewer?.caption}
        onClose={() => setViewer(null)}
      />
    </Card>
  );
}
