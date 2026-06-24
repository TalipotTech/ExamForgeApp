"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

const PURPOSES = [
  "tutorial_diagram",
  "formula_card",
  "comparison_infographic",
  "pattern_chart",
  "topic_thumbnail",
  "exam_cover",
  "marketplace_cover",
  "creator_banner",
  "social_media",
  "chapter_illustration",
  "math_visualization",
  "science_diagram",
  "history_infographic",
  "chapter_thumbnail",
  "board_icon",
  "worksheet_header",
  "classroom_banner",
  "doubt_visualization",
  "placeholder",
  "custom",
] as const;

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const SIZES = ["small", "standard", "hd"] as const;
const STYLES = ["realistic", "illustration", "diagram", "flat", "watercolor"] as const;

type Purpose = (typeof PURPOSES)[number];
type AspectRatio = (typeof ASPECT_RATIOS)[number];
type Size = (typeof SIZES)[number];
type Style = (typeof STYLES)[number];

// Local image URLs from the API are relative (/api/images/...). Prefix them
// with the API origin so they load from the web app's origin.
function resolveImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/$/, "");
  return `${base}${url}`;
}

const selectClass = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

export function ImageGenTestPanel(): React.ReactElement {
  const [prompt, setPrompt] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("tutorial_diagram");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [size, setSize] = useState<Size>("standard");
  const [style, setStyle] = useState<Style>("diagram");
  const [viewerOpen, setViewerOpen] = useState(false);

  const generate = trpc.imageGeneration.generate.useMutation();
  const utils = trpc.useUtils();

  async function handleGenerate(): Promise<void> {
    await generate.mutateAsync({ prompt, purpose, aspectRatio, size, style });
    // Refresh the stats card + recent-images gallery so the new image shows up.
    void utils.imageGeneration.getStats.invalidate();
    void utils.imageGeneration.getRecent.invalidate();
  }

  const result = generate.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">🧪 Generate Test Image</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="img-prompt">Prompt</Label>
          <Textarea
            id="img-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Drug absorption pathway through the GI tract, labeled stages"
            rows={3}
          />
          <p className="text-muted-foreground mt-1 text-xs">5–1000 characters.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Purpose</Label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as Purpose)}
              className={selectClass}
            >
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Aspect ratio</Label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className={selectClass}
            >
              {ASPECT_RATIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Size</Label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as Size)}
              className={selectClass}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Style</Label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as Style)}
              className={selectClass}
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={generate.isPending || prompt.trim().length < 5}>
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>

        {generate.error && <p className="text-destructive text-sm">{generate.error.message}</p>}

        {result && (
          <div className="space-y-2 rounded-md border p-3">
            <button type="button" onClick={() => setViewerOpen(true)} className="block">
              <img
                src={resolveImageUrl(result.cdnUrl)}
                alt="Generated"
                className="max-h-96 w-auto cursor-zoom-in rounded"
              />
            </button>
            <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <span>Model: {result.model}</span>
              <span>Cost: ${result.cost.toFixed(3)}</span>
              <span>
                Size: {result.width}×{result.height}
              </span>
              <span>Time: {(result.generationTimeMs / 1000).toFixed(1)}s</span>
            </div>
            <p className="text-muted-foreground break-all text-xs">{result.cdnUrl}</p>
          </div>
        )}
      </CardContent>

      <ImageLightbox
        open={viewerOpen && !!result}
        src={result ? resolveImageUrl(result.cdnUrl) : ""}
        alt="Generated image"
        onClose={() => setViewerOpen(false)}
      />
    </Card>
  );
}
