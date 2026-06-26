"use client";

import { useState } from "react";
import { LayoutGrid, Table as TableIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 24;

function resolveImageUrl(url: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/$/, "");
  return `${base}${url}`;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

type ViewMode = "grid" | "table";

export function ImageGenGallery(): React.ReactElement {
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // committed (on Enter/click)
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = trpc.imageGeneration.listImages.useQuery(
    { search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { staleTime: 30_000, placeholderData: (prev) => prev },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  function commitSearch(): void {
    setPage(0);
    setSearch(searchInput.trim());
  }

  function open(src: string | null, caption: string): void {
    if (src) setViewer({ src: resolveImageUrl(src), caption });
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">🖼️ Generated Images ({total})</CardTitle>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("grid")}
              className="gap-1.5"
            >
              <LayoutGrid className="size-4" /> Grid
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("table")}
              className="gap-1.5"
            >
              <TableIcon className="size-4" /> Table
            </Button>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitSearch()}
            placeholder="Search topic, prompt, purpose, model…"
            className="pl-8"
          />
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {search ? "No images match your search." : "No images yet."}
          </p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => open(img.cdnUrl, img.topicTitle ?? img.prompt)}
                className="group block overflow-hidden rounded-md border text-left"
                title={img.prompt}
              >
                <img
                  src={resolveImageUrl(img.cdnUrl)}
                  alt={img.prompt}
                  loading="lazy"
                  className="bg-muted aspect-video w-full object-cover transition-opacity group-hover:opacity-90"
                />
                <div className="space-y-0.5 p-2 text-xs">
                  <div className="truncate font-medium" title={img.topicTitle ?? undefined}>
                    {img.topicTitle ?? <span className="text-muted-foreground">— no topic —</span>}
                  </div>
                  <div className="text-muted-foreground truncate">{img.purpose}</div>
                  <div className="text-muted-foreground line-clamp-2" title={img.prompt}>
                    {img.prompt}
                  </div>
                  <div className="text-muted-foreground flex justify-between">
                    <span className="truncate">
                      {img.provider}/{img.model}
                    </span>
                    <span>${img.costUsd.toFixed(3)}</span>
                  </div>
                  <div className="text-muted-foreground">{fmtDate(img.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2 font-medium">Image</th>
                  <th className="p-2 font-medium">Topic</th>
                  <th className="p-2 font-medium">Purpose</th>
                  <th className="p-2 font-medium">Prompt</th>
                  <th className="p-2 font-medium">Provider / Model</th>
                  <th className="p-2 text-right font-medium">Size</th>
                  <th className="p-2 text-right font-medium">Cost</th>
                  <th className="p-2 text-right font-medium">Time</th>
                  <th className="p-2 font-medium">Generated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((img) => (
                  <tr
                    key={img.id}
                    className="hover:bg-muted/40 cursor-pointer border-b align-top"
                    onClick={() => open(img.cdnUrl, img.topicTitle ?? img.prompt)}
                  >
                    <td className="p-2">
                      <img
                        src={resolveImageUrl(img.cdnUrl)}
                        alt=""
                        loading="lazy"
                        className="bg-muted h-12 w-20 rounded object-cover"
                      />
                    </td>
                    <td className="max-w-40 p-2">
                      <div className="truncate" title={img.topicTitle ?? undefined}>
                        {img.topicTitle ?? "—"}
                      </div>
                    </td>
                    <td className="p-2">{img.purpose}</td>
                    <td className="max-w-64 p-2">
                      <div className="text-muted-foreground line-clamp-2" title={img.prompt}>
                        {img.prompt}
                      </div>
                    </td>
                    <td className="p-2">
                      {img.provider}/{img.model}
                      {img.wasFallback && (
                        <span
                          className="ml-1 text-amber-600"
                          title={`fallback: ${img.fallbackModel}`}
                        >
                          ⤵
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {img.width && img.height ? `${img.width}×${img.height}` : "—"}
                    </td>
                    <td className="p-2 text-right">${img.costUsd.toFixed(3)}</td>
                    <td className="p-2 text-right">
                      {img.generationTimeMs ? `${(img.generationTimeMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="text-muted-foreground whitespace-nowrap p-2">
                      {fmtDate(img.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-muted-foreground text-xs">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
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
