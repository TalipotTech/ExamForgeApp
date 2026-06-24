"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImageGenTestPanel } from "@/components/admin/image-gen-test-panel";
import { ImageSyncPanel } from "@/components/admin/image-sync-panel";
import { ImageGenStats } from "@/components/admin/image-gen-stats";
import { ImageGenGallery } from "@/components/admin/image-gen-gallery";

export default function AdminImagesPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">AI Image Generation</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate diagrams and illustrations for tutorials and topics, and track usage against
            the monthly budget.
          </p>
        </div>
        <HelpDialog />
      </div>

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate">Single image</TabsTrigger>
          <TabsTrigger value="sync">Topic sync</TabsTrigger>
          <TabsTrigger value="stats">Usage &amp; cost</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4 space-y-4">
          <p className="text-muted-foreground text-sm">
            Generate one image from a prompt you type. Best for testing models, styles, and that
            your storage + API keys work.
          </p>
          <ImageGenTestPanel />
          <ImageGenGallery />
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <p className="text-muted-foreground mb-3 text-sm">
            Generate a context-derived diagram for one topic now, or queue the whole syllabus to the
            background worker. Prompts are written automatically from each topic&apos;s content.
          </p>
          <ImageSyncPanel />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <ImageGenStats />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HelpDialog(): React.ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
          <HelpCircle className="size-4" />
          Help
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How AI Image Generation works</DialogTitle>
          <DialogDescription>Two ways to create images, one place to watch cost.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-1 font-semibold">Before you start (one-time)</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                Set <code>OPENAI_API_KEY</code> and <code>ANTHROPIC_API_KEY</code> in the
                environment. Optionally <code>GOOGLE_AI_API_KEY</code> /{" "}
                <code>IDEOGRAM_API_KEY</code> for those models.
              </li>
              <li>
                Storage defaults to <code>local</code> (files in <code>storage/images</code>, served
                at <code>/api/images/*</code>). Switch to S3/R2 later with{" "}
                <code>IMAGE_STORAGE_DRIVER=s3</code> — no code change.
              </li>
              <li>
                The <strong>Topic sync</strong> tab needs the background worker running (
                <code>worker:dev</code>); single-image generation does not.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Tab 1 — Single image (manual test)</h3>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
              <li>Type a prompt (5–1000 chars).</li>
              <li>
                Pick <strong>Purpose</strong> (routes to the best model), aspect ratio, size, style.
              </li>
              <li>
                Click <strong>Generate</strong> — the image renders inline with model, cost, and
                time. Errors (e.g. missing key) appear in red.
              </li>
            </ol>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Tab 2 — Topic sync (context-derived)</h3>
            <p className="text-muted-foreground mb-1">
              The prompt is written automatically from each topic&apos;s title, key terms, and
              tutorial text — you never type it. Two modes:
            </p>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
              <li>
                <strong>Single topic (default):</strong> pick a syllabus, then a topic, and click{" "}
                <strong>Generate for topic</strong>. It runs immediately (no worker needed) and
                shows the image inline. Best for testing without spending many credits.
              </li>
              <li>
                <strong>Whole syllabus:</strong> tick <em>Generate for the whole syllabus</em> and
                click <strong>Sync whole syllabus</strong>. Every eligible topic is queued to the
                background worker (needs <code>worker:dev</code> running). Watch the status row:
                Ready / Skipped / Errors / Pending.
              </li>
              <li>
                Both modes skip topics whose content is unchanged (idempotent) and topics that
                don&apos;t need a diagram. Tick <strong>Force regenerate</strong> to override. Bulk
                runs pause if the monthly budget is reached.
              </li>
            </ol>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Tab 3 — Usage &amp; cost</h3>
            <p className="text-muted-foreground">
              Monthly totals by model and purpose, budget usage, fallback rate, and average
              generation time. At 70% budget decorative images downgrade to a cheaper model; at 90%
              everything does; at 100% generation stops.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
