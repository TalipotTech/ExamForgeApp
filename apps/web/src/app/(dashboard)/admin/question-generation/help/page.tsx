"use client";

/**
 * Question Generation — help / reference documentation.
 *
 * One-stop reference for admins who want to understand what happens
 * under the hood: which workers run when, which BullMQ queues are
 * involved, which tables hold what, and where decisions are logged.
 *
 * No tRPC queries here — this is static documentation.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Cog, Database, HelpCircle, ListChecks, Workflow } from "lucide-react";

export default function QuestionGenerationHelpPage(): React.ReactElement {
  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <Link
          href={"/admin/question-generation" as "/"}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3.5" />
          Back to dashboard
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <HelpCircle className="size-6" />
          Question Generation — how it works
        </h1>
        <p className="text-muted-foreground text-sm">
          Reference for the full pipeline: which step hands off to which, what runs in the
          background, and where data lands.
        </p>
      </div>

      {/* ── Overview ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="size-4" />
            Pipeline overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs leading-relaxed">
          <p>
            The feature is split into five admin-driven stages plus two autonomous workers that fire
            between them. Every question the system ever shows a student passes through a subset of
            this pipeline.
          </p>
          <pre className="bg-muted/40 overflow-x-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed">
            {`Ingest                    (admin)
   ↓  portal-ingestion-worker (auto: discovery)
   ↓  portal-processing-worker (auto: PDF → staged_questions)
Content Hub              (admin: browse inventory)
   ↓  universal-discovery-worker (broad/deep/validate)
Verification             (admin: Approve all)
   ↓  pattern-analysis-worker (auto: classify-paper → analyze-pattern)
   ↓  verification-worker (auto: 6-layer per question)
Topic Generation         (admin: queue job per node)
   ↓  topic-generation-worker (AI call → questions table)
   ↓  verification-worker (auto-queued per generated question)
Questions Library        (admin: final pool)`}
          </pre>
          <p className="text-muted-foreground">
            Everything between stages is non-blocking — a failed auto-trigger logs a warning but
            never fails the admin action that produced the upstream rows.
          </p>
        </CardContent>
      </Card>

      {/* ── Step by step ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4" />
            Step-by-step
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs leading-relaxed">
          <Step
            num="1"
            title="Ingest"
            path="/scraper/ingest"
            body={
              <>
                Two paths. The <em>Portal discovery</em> card crawls a portal index page (e.g.{" "}
                <code>keralapsc.gov.in/previous-question-papers</code>) and writes every discovered
                PDF as a <code>portal_documents</code> row in <em>discovered</em> status. The{" "}
                <em>Ingest a single paper (direct PDF)</em> card skips discovery for one-off PDFs
                that the index doesn&rsquo;t surface — admin pastes the URL, picks the target exam,
                optionally marks it &ldquo;official answer key&rdquo;, and the single document is
                queued immediately.
              </>
            }
            writes="portal_documents (new rows, status=discovered)"
            workers="portal-ingestion-worker (discovery crawl), portal-processing-worker (download + Vision/text extraction → staged_questions)"
          />
          <Step
            num="2"
            title="Content Hub"
            path="/admin/question-generation/content-hub"
            body={
              <>
                Inventory view. Shows every scraped examination from the portal calendars alongside
                its canonical match, how many past papers we have, answer keys, syllabi,
                notifications, and an overall completeness score. Admin uses this to spot which
                exams are ready for generation and which need more ingest.
              </>
            }
            writes="—"
            workers="universal-discovery-worker refreshes exams.contentCompleteness JSONB when you click Refresh or on schedule."
          />
          <Step
            num="3"
            title="Verification"
            path="/admin/question-generation/verification"
            body={
              <>
                The 6-layer verdict queue. Filter by exam + status + source. Use{" "}
                <strong>Approve all</strong> for trusted batches (e.g. the 100 questions you just
                ingested from an official answer-key PDF). Clicking a row opens a drawer with every
                per-layer score, the audit trail, and inline edit. Approving promotes the question
                and writes a <code>question_verifications</code> audit row with{" "}
                <code>layer=&apos;admin&apos;</code>.
              </>
            }
            writes="questions.verificationStatus, verifiedBy, verifiedAt; question_verifications (one audit row per decision)"
            workers="pattern-analysis-worker auto-queues after approval (classify-paper). Once classified, verification-worker auto-queues per question."
          />
          <Step
            num="4"
            title="Topic Generation"
            path="/admin/question-generation/topic-gen"
            body={
              <>
                Picker lists every scraped examination (same source as <code>/exams</code>). Pick
                one → syllabus-node table shows how many real/textbook seeds each topic has. Any
                topic with ≥3 seeds is eligible — click <strong>Generate</strong> and a topic-seeded
                AI job is queued. The worker pulls up to 10 seeds for that node, fingerprints the
                exam&rsquo;s style & difficulty distribution, and asks the AI for N new questions
                following the fingerprint.
              </>
            }
            writes="questions (sourceType='topic_ai', mappedSyllabusNodeId set)"
            workers="topic-generation-worker runs the AI call. Every generated question is then auto-queued for 6-layer verification."
          />
          <Step
            num="5"
            title="Questions Library"
            path="/questions"
            body={
              <>
                The final pool. Admin-searchable, filterable. Every row shows its trust badge (🟢
                real paper / 🔵 textbook / 🟡 verified AI / 🟠 topic AI / ⚪ supplementary).
                Approved questions are what gets served to students in exam sessions.
              </>
            }
            writes="—"
            workers="—"
          />
        </CardContent>
      </Card>

      {/* ── Workers ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cog className="size-4" />
            Workers & BullMQ queues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs leading-relaxed">
          <p>
            All workers run via <code>pnpm --filter @examforge/api worker:dev</code> (locally) or as
            a dedicated App Runner service in prod. Each has its own BullMQ queue backed by Redis.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left font-medium">Worker</th>
                  <th className="p-2 text-left font-medium">Queue</th>
                  <th className="p-2 text-left font-medium">Triggered by</th>
                  <th className="p-2 text-left font-medium">What it does</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <WorkerRow
                  worker="portal-ingestion-worker"
                  queue="portal-ingestion"
                  trigger="Admin discovers a portal URL"
                  body="Crawls the page, finds PDF links, creates portal_documents rows (status=discovered)."
                />
                <WorkerRow
                  worker="portal-processing-worker"
                  queue="portal-processing"
                  trigger="Admin clicks Process / direct-PDF ingest"
                  body="Downloads the PDF, runs AI Vision extraction, writes to staged_questions with sourceType + answerSource hints."
                />
                <WorkerRow
                  worker="universal-discovery-worker"
                  queue="universal-discovery"
                  trigger="Admin refreshes Content Hub or scheduled tick"
                  body="Crawls the 26-portal registry, updates exams.contentCompleteness."
                />
                <WorkerRow
                  worker="pattern-analysis-worker"
                  queue="pattern-analysis"
                  trigger="Auto-queued after approveQuestions"
                  body="classify-paper: AI assigns subject/topic/style/difficulty and maps to syllabus nodes. Once ≥3 papers exist, analyze-pattern builds the exam fingerprint."
                />
                <WorkerRow
                  worker="verification-worker"
                  queue="question-verification"
                  trigger="Auto-queued after classification & after topic-gen; manual revalidate"
                  body="6 layers: source trust, factual (GPT-4o second opinion), syllabus alignment, pattern match, uniqueness (pgvector), composite scoring. Writes verification_status + 1 audit row per layer."
                />
                <WorkerRow
                  worker="topic-generation-worker"
                  queue="topic-generation"
                  trigger="Admin clicks Generate in Topic Generation"
                  body="Loads ≥3 seeds for the node, builds style/difficulty fingerprint, calls the AI with seeds + exam context, writes new questions with sourceType='topic_ai'."
                />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Tables ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" />
            Where things are stored
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs leading-relaxed">
          <Row
            k="portal_documents"
            v="Every ingested PDF. metadata.isOfficialAnswerKey drives answer_source on extracted questions."
          />
          <Row
            k="staged_questions"
            v="Pending admin approval. Trust hints (sourceType, answerSource) travel via metadata — promoted to real columns on approve."
          />
          <Row
            k="questions"
            v="The canonical pool. sourceType ∈ real_paper|textbook|pattern_ai|topic_ai|supplementary_ai. verificationStatus drives whether students see it."
          />
          <Row
            k="question_verifications"
            v="Audit trail — one row per layer per verification pass, plus one per admin decision. Never pruned."
          />
          <Row
            k="exam_patterns / paper_analysis"
            v="Built by pattern-analysis-worker. Needed before topic-seeded generation can match the exam fingerprint."
          />
          <Row
            k="ai_usage_logs"
            v="Every AI call across every worker — provider, tokens, latency, cost estimate. Scope by feature / exam / user."
          />
        </CardContent>
      </Card>

      {/* ── Gotchas ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Common gotchas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs leading-relaxed">
          <Gotcha
            title="Generate button stays disabled"
            body="Topic Generation needs ≥3 real-paper or textbook questions mapped to the same syllabus node. Seed count lives on the row. If it's 0, no source_type='real_paper'/'textbook' questions mapped to that node yet — ingest more papers, or verify that classification assigned them correctly."
          />
          <Gotcha
            title="Verification queue empty after ingest"
            body="Portal-processing writes to staged_questions, not questions. Classification (and therefore verification) only fires after Approve all in Verification — that's the moment the rows are promoted."
          />
          <Gotcha
            title="Pattern auto-trigger skipped"
            body="analyze-pattern needs ≥3 classified papers for an exam before it kicks in (see pattern-analysis-worker). With 1 paper you'll see 'no pattern yet (need 3)' — ingest two more."
          />
          <Gotcha
            title="Cross-exam seeds"
            body="Questions from a different exam (e.g. GPAT used for Kerala PSC prep) get a relevanceToTarget score from exam-overlap-matrix.ts — 0-1. The topic-seeded generator down-weights them versus native seeds."
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Small presentation components ────────────────────────

function Step({
  num,
  title,
  path,
  body,
  writes,
  workers,
}: {
  num: string;
  title: string;
  path: string;
  body: React.ReactNode;
  writes: string;
  workers: string;
}): React.ReactElement {
  return (
    <div className="border-l-primary/40 space-y-1 border-l-2 pl-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">
          {num}
        </Badge>
        <Link href={path as "/"} className="text-sm font-semibold hover:underline">
          {title}
        </Link>
        <code className="text-muted-foreground text-[10px]">{path}</code>
      </div>
      <p className="text-muted-foreground">{body}</p>
      <div className="text-muted-foreground grid grid-cols-1 gap-0.5 pt-1 text-[10px] sm:grid-cols-2">
        <span>
          <strong>Writes:</strong> {writes}
        </span>
        <span>
          <strong>Workers:</strong> {workers}
        </span>
      </div>
    </div>
  );
}

function WorkerRow({
  worker,
  queue,
  trigger,
  body,
}: {
  worker: string;
  queue: string;
  trigger: string;
  body: string;
}): React.ReactElement {
  return (
    <tr>
      <td className="p-2 font-mono">{worker}</td>
      <td className="p-2 font-mono">{queue}</td>
      <td className="p-2">{trigger}</td>
      <td className="text-muted-foreground p-2">{body}</td>
    </tr>
  );
}

function Row({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0 sm:flex-row sm:gap-3">
      <code className="shrink-0 font-mono text-[11px] sm:w-44">{k}</code>
      <span className="text-muted-foreground">{v}</span>
    </div>
  );
}

function Gotcha({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-0.5">{body}</p>
    </div>
  );
}
