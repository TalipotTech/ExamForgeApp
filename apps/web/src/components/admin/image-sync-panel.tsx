"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

const selectClass = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

// Optional overrides — "" means Auto (content-derived / default).
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

function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/$/, "");
  return `${base}${url}`;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// A dropped proxy response (long generation) surfaces as a non-JSON / network
// error even though the backend finished — detect those so we poll instead of
// showing a scary failure.
function isTransportError(msg: string): boolean {
  return /json|unexpected token|fetch|network|failed|socket|timeout|econnreset/i.test(msg);
}

export function ImageSyncPanel(): React.ReactElement {
  const [selected, setSelected] = useState("");
  const [topicSelected, setTopicSelected] = useState("");
  const [wholeSyllabus, setWholeSyllabus] = useState(false); // OFF = single topic (MVP default)
  const [force, setForce] = useState(false);
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [purposeOverride, setPurposeOverride] = useState<"" | (typeof PURPOSES)[number]>("");
  const [aspectOverride, setAspectOverride] = useState<"" | (typeof ASPECT_RATIOS)[number]>("");
  const [sizeOverride, setSizeOverride] = useState<"" | (typeof SIZES)[number]>("");
  const [styleOverride, setStyleOverride] = useState<"" | (typeof STYLES)[number]>("");
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genNotice, setGenNotice] = useState<string | null>(null);
  const beforeCountRef = useRef(0);
  const genTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syllabusId = Number(selected);
  const validSyllabus = Number.isInteger(syllabusId) && syllabusId > 0;
  const topicId = Number(topicSelected);
  const validTopic = Number.isInteger(topicId) && topicId > 0;
  const singleTopic = !wholeSyllabus;

  const syllabiQuery = trpc.imageGeneration.listSyllabi.useQuery();
  const topicsQuery = trpc.imageGeneration.listTopics.useQuery(
    { syllabusId },
    { enabled: validSyllabus && singleTopic },
  );
  const topicImagesQuery = trpc.imageGeneration.listTopicImages.useQuery(
    { syllabusNodeId: topicId },
    { enabled: validTopic && singleTopic, refetchInterval: generating ? 3000 : false },
  );
  const utils = trpc.useUtils();

  const syncSyllabus = trpc.imageGeneration.syncSyllabus.useMutation();
  const syncTopic = trpc.imageGeneration.syncTopic.useMutation();

  const status = trpc.imageGeneration.getSyncStatus.useQuery(
    { syllabusId },
    { enabled: validSyllabus, refetchInterval: syncSyllabus.isSuccess ? 5000 : false },
  );

  function clearGenTimeout(): void {
    if (genTimeoutRef.current) {
      clearTimeout(genTimeoutRef.current);
      genTimeoutRef.current = null;
    }
  }

  function resetGenState(): void {
    setGenerating(false);
    setGenNotice(null);
    clearGenTimeout();
  }

  function handleSyllabusChange(value: string): void {
    setSelected(value);
    setTopicSelected("");
    setAdditionalPrompt("");
    syncTopic.reset();
    resetGenState();
  }

  function handleTopicChange(value: string): void {
    setTopicSelected(value);
    setAdditionalPrompt("");
    syncTopic.reset();
    resetGenState();
  }

  // The new image appeared (via refetch/poll) — clear the in-flight state.
  // Covers the case where the proxy dropped the response but generation
  // still completed on the backend.
  useEffect(() => {
    const count = topicImagesQuery.data?.length ?? 0;
    if (generating && count > beforeCountRef.current) {
      setGenerating(false);
      setGenNotice("✓ Image generated — see “Images already on this topic” above.");
      clearGenTimeout();
    }
  }, [generating, topicImagesQuery.data?.length]);

  // Clear any pending safety timer on unmount.
  useEffect(() => () => clearGenTimeout(), []);

  async function handleWholeSyllabus(): Promise<void> {
    if (!validSyllabus) return;
    await syncSyllabus.mutateAsync({ syllabusId, force });
    void utils.imageGeneration.getSyncStatus.invalidate({ syllabusId });
  }

  function refreshAfterTopic(): void {
    void utils.imageGeneration.listTopics.invalidate({ syllabusId });
    void utils.imageGeneration.listTopicImages.invalidate({ syllabusNodeId: topicId });
    void utils.imageGeneration.getSyncStatus.invalidate({ syllabusId });
    void utils.imageGeneration.listImages.invalidate();
    void utils.imageGeneration.getStats.invalidate();
  }

  async function handleSingleTopic(): Promise<void> {
    if (!validTopic) return;
    beforeCountRef.current = topicImagesQuery.data?.length ?? 0;
    setGenNotice(null);
    setGenerating(true);
    // Safety net: stop waiting after 2 min even if nothing arrives.
    clearGenTimeout();
    genTimeoutRef.current = setTimeout(() => {
      setGenerating(false);
      setGenNotice("Still not ready after 2 minutes — it may have failed. Check Generated Images.");
    }, 120_000);

    try {
      await syncTopic.mutateAsync({
        syllabusNodeId: topicId,
        force,
        additionalPrompt: additionalPrompt.trim() || undefined,
        purpose: purposeOverride || undefined,
        aspectRatio: aspectOverride || undefined,
        size: sizeOverride || undefined,
        style: styleOverride || undefined,
      });
      // Resolved cleanly — the effect/refetch will surface the image.
      setGenerating(false);
      clearGenTimeout();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isTransportError(msg)) {
        // Backend likely still finishing — keep polling, drop the scary error.
        syncTopic.reset();
        setGenNotice("Generating… this can take ~30s. The image will appear automatically.");
      } else {
        // Real error (e.g. budget) — show it.
        resetGenState();
      }
    } finally {
      refreshAfterTopic();
    }
  }

  const syllabi = syllabiQuery.data ?? [];
  const topics = topicsQuery.data ?? [];
  const topicImages = topicImagesQuery.data ?? [];
  const topicResult = syncTopic.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">🔄 Sync Topic Images (Context-Derived)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Generates a context-derived diagram from each topic&apos;s title, key terms, and tutorial
          text — you don&apos;t type the prompt. Unchanged topics are skipped automatically
          (idempotent).
        </p>

        {/* Mode toggle */}
        <label className="bg-muted/40 flex items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={wholeSyllabus}
            onChange={(e) => {
              setWholeSyllabus(e.target.checked);
              resetGenState();
            }}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Generate for the whole syllabus (background worker)</span>
            <span className="text-muted-foreground block text-xs">
              Off (recommended for testing): pick a single topic and generate it now. On: queues
              every eligible topic to the background worker — can consume significant credits.
            </span>
          </span>
        </label>

        {/* Syllabus picker */}
        <div>
          <Label htmlFor="sync-syllabus">Syllabus</Label>
          <select
            id="sync-syllabus"
            value={selected}
            onChange={(e) => handleSyllabusChange(e.target.value)}
            className={selectClass}
            disabled={syllabiQuery.isLoading}
          >
            <option value="">{syllabiQuery.isLoading ? "Loading…" : "Select a syllabus…"}</option>
            {syllabi.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.examName} ({s.topicCount} topics)
              </option>
            ))}
          </select>
        </div>

        {!syllabiQuery.isLoading && syllabi.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No syllabi found. Upload one from the Syllabus page first.
          </p>
        )}

        {/* Single-topic mode */}
        {singleTopic && validSyllabus && (
          <>
            <div>
              <Label htmlFor="sync-topic">Topic</Label>
              <select
                id="sync-topic"
                value={topicSelected}
                onChange={(e) => handleTopicChange(e.target.value)}
                className={selectClass}
                disabled={topicsQuery.isLoading}
              >
                <option value="">
                  {topicsQuery.isLoading ? "Loading topics…" : "Select a topic…"}
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.imageStatus === "ready" ? "✓ " : ""}
                    {t.title}
                    {t.hasTutorial ? "" : " — no reader page"}
                  </option>
                ))}
              </select>
              {validTopic && !topics.find((t) => t.id === topicId)?.hasTutorial && (
                <p className="mt-1 text-xs text-amber-600">
                  This is a section (no reader page of its own). Its image is shown as a section
                  illustration on each of its sub-topics&apos; pages. To target one sub-topic only,
                  pick that leaf topic instead.
                </p>
              )}
            </div>

            {/* Existing images already attached to this topic */}
            {validTopic && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">
                  Images already on this topic ({topicImages.length})
                </p>
                {topicImagesQuery.isLoading ? (
                  <p className="text-muted-foreground text-xs">Loading…</p>
                ) : topicImages.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    None yet — generate one below. (Existing images are shown here so you don&apos;t
                    regenerate and waste tokens.)
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {topicImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        title={img.prompt}
                        onClick={() =>
                          setViewer({ src: resolveImageUrl(img.cdnUrl), caption: img.prompt })
                        }
                        className="overflow-hidden rounded border text-left"
                      >
                        <img
                          src={resolveImageUrl(img.cdnUrl)}
                          alt={img.prompt}
                          loading="lazy"
                          className="bg-muted aspect-video w-full object-cover"
                        />
                        <div className="text-muted-foreground space-y-0.5 p-1.5 text-[11px]">
                          <div className="line-clamp-2" title={img.prompt}>
                            {img.prompt}
                          </div>
                          <div className="flex justify-between">
                            <span className="truncate">
                              {img.provider}/{img.model}
                            </span>
                            <span>${img.costUsd.toFixed(3)}</span>
                          </div>
                          <div>{fmtDate(img.createdAt)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Optional additional prompt */}
            {validTopic && (
              <div>
                <Label htmlFor="sync-extra">Additional prompt (optional)</Label>
                <Textarea
                  id="sync-extra"
                  value={additionalPrompt}
                  onChange={(e) => setAdditionalPrompt(e.target.value)}
                  placeholder="e.g. emphasise the feedback loop; use a side-by-side comparison; label in Hindi…"
                  rows={2}
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Steers this image. A new prompt produces a different image (and adds to the topic
                  rather than replacing).
                </p>
              </div>
            )}

            {/* Optional overrides — Auto = content-derived / default */}
            {validTopic && (
              <div>
                <Label>Overrides (optional)</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <select
                    aria-label="Purpose override"
                    value={purposeOverride}
                    onChange={(e) =>
                      setPurposeOverride(e.target.value as "" | (typeof PURPOSES)[number])
                    }
                    className={selectClass}
                  >
                    <option value="">Purpose: Auto</option>
                    {PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Aspect ratio override"
                    value={aspectOverride}
                    onChange={(e) =>
                      setAspectOverride(e.target.value as "" | (typeof ASPECT_RATIOS)[number])
                    }
                    className={selectClass}
                  >
                    <option value="">Ratio: Auto (16:9)</option>
                    {ASPECT_RATIOS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Size override"
                    value={sizeOverride}
                    onChange={(e) => setSizeOverride(e.target.value as "" | (typeof SIZES)[number])}
                    className={selectClass}
                  >
                    <option value="">Size: Auto (standard)</option>
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Style override"
                    value={styleOverride}
                    onChange={(e) =>
                      setStyleOverride(e.target.value as "" | (typeof STYLES)[number])
                    }
                    className={selectClass}
                  >
                    <option value="">Style: Auto</option>
                    {STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Leave on Auto to keep purpose/style content-derived. Overriding any value counts
                  as a new variation (won&apos;t be skipped as a duplicate).
                </p>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Force regenerate
          </label>
          {wholeSyllabus ? (
            <Button
              onClick={handleWholeSyllabus}
              disabled={!validSyllabus || syncSyllabus.isPending}
            >
              {syncSyllabus.isPending ? "Queuing…" : "Sync whole syllabus (background)"}
            </Button>
          ) : (
            <Button onClick={handleSingleTopic} disabled={!validTopic || generating}>
              {generating
                ? "Generating…"
                : topicImages.length > 0
                  ? "Generate another image"
                  : "Generate for topic"}
            </Button>
          )}
          {!wholeSyllabus && generating && (
            <span className="text-muted-foreground text-xs">
              This can take ~30s — the image appears automatically.
            </span>
          )}
        </div>

        {/* Whole-syllabus feedback */}
        {syncSyllabus.error && (
          <p className="text-destructive text-sm">{syncSyllabus.error.message}</p>
        )}
        {syncSyllabus.isSuccess && (
          <p className="text-sm text-green-600">
            Queued (job {syncSyllabus.data.jobId}). Status refreshes below.
          </p>
        )}

        {/* Single-topic feedback */}
        {genNotice && <p className="text-sm text-blue-600">{genNotice}</p>}
        {syncTopic.error && <p className="text-destructive text-sm">{syncTopic.error.message}</p>}
        {topicResult && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            {topicResult.status === "ready" ? (
              <>
                <p className="text-green-600">Image generated and attached to the topic.</p>
                <button
                  type="button"
                  onClick={() =>
                    setViewer({
                      src: resolveImageUrl(topicResult.imageUrl),
                      caption: "Generated topic image",
                    })
                  }
                  className="block"
                >
                  <img
                    src={resolveImageUrl(topicResult.imageUrl)}
                    alt="Generated topic image"
                    className="max-h-80 w-auto cursor-zoom-in rounded"
                  />
                </button>
              </>
            ) : (
              <p className="text-muted-foreground">
                Skipped —{" "}
                {topicResult.reason === "not_needed"
                  ? "this topic doesn't need a diagram."
                  : "unchanged since last generation (add an additional prompt, or tick Force)."}
              </p>
            )}
          </div>
        )}

        {/* Status row */}
        {validSyllabus && status.data && (
          <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border p-3 text-sm sm:grid-cols-5">
            <span>Topics: {status.data.total}</span>
            <span className="text-green-600">Ready: {status.data.ready}</span>
            <span>Skipped: {status.data.skipped}</span>
            <span className="text-destructive">Errors: {status.data.error}</span>
            <span>Pending: {status.data.none}</span>
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
