"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

const selectClass = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/$/, "");
  return `${base}${url}`;
}

export function ImageSyncPanel(): React.ReactElement {
  const [selected, setSelected] = useState("");
  const [topicSelected, setTopicSelected] = useState("");
  const [wholeSyllabus, setWholeSyllabus] = useState(false); // OFF = single topic (MVP default)
  const [force, setForce] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const syllabusId = Number(selected);
  const validSyllabus = Number.isInteger(syllabusId) && syllabusId > 0;
  const topicId = Number(topicSelected);
  const validTopic = Number.isInteger(topicId) && topicId > 0;

  const syllabiQuery = trpc.imageGeneration.listSyllabi.useQuery();
  const topicsQuery = trpc.imageGeneration.listTopics.useQuery(
    { syllabusId },
    { enabled: validSyllabus && !wholeSyllabus },
  );
  const utils = trpc.useUtils();

  const syncSyllabus = trpc.imageGeneration.syncSyllabus.useMutation();
  const syncTopic = trpc.imageGeneration.syncTopic.useMutation();

  const status = trpc.imageGeneration.getSyncStatus.useQuery(
    { syllabusId },
    { enabled: validSyllabus, refetchInterval: syncSyllabus.isSuccess ? 5000 : false },
  );

  async function handleSyllabusChange(value: string): Promise<void> {
    setSelected(value);
    setTopicSelected("");
    syncTopic.reset();
  }

  async function handleWholeSyllabus(): Promise<void> {
    if (!validSyllabus) return;
    await syncSyllabus.mutateAsync({ syllabusId, force });
    void utils.imageGeneration.getSyncStatus.invalidate({ syllabusId });
  }

  async function handleSingleTopic(): Promise<void> {
    if (!validTopic) return;
    await syncTopic.mutateAsync({ syllabusNodeId: topicId, force });
    void utils.imageGeneration.listTopics.invalidate({ syllabusId });
    void utils.imageGeneration.getSyncStatus.invalidate({ syllabusId });
    void utils.imageGeneration.getRecent.invalidate();
  }

  const syllabi = syllabiQuery.data ?? [];
  const topics = topicsQuery.data ?? [];
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
            onChange={(e) => setWholeSyllabus(e.target.checked)}
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
            onChange={(e) => void handleSyllabusChange(e.target.value)}
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
        {!wholeSyllabus && validSyllabus && (
          <div>
            <Label htmlFor="sync-topic">Topic</Label>
            <select
              id="sync-topic"
              value={topicSelected}
              onChange={(e) => {
                setTopicSelected(e.target.value);
                syncTopic.reset();
              }}
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
                </option>
              ))}
            </select>
          </div>
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
            <Button onClick={handleSingleTopic} disabled={!validTopic || syncTopic.isPending}>
              {syncTopic.isPending ? "Generating…" : "Generate for topic"}
            </Button>
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
        {syncTopic.error && <p className="text-destructive text-sm">{syncTopic.error.message}</p>}
        {topicResult && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            {topicResult.status === "ready" ? (
              <>
                <p className="text-green-600">Image generated and attached to the topic.</p>
                <button type="button" onClick={() => setViewerOpen(true)} className="block">
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
                  : "unchanged since last generation (tick Force to regenerate)."}
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
        open={viewerOpen && topicResult?.status === "ready"}
        src={topicResult?.status === "ready" ? resolveImageUrl(topicResult.imageUrl) : ""}
        alt="Generated topic image"
        onClose={() => setViewerOpen(false)}
      />
    </Card>
  );
}
