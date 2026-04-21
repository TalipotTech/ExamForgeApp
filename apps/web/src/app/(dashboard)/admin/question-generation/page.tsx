"use client";

/**
 * Question Generation — hub / dashboard.
 *
 * The entry point under /admin/question-generation. Renders a
 * quick-start info box explaining the 5-step flow, then a numbered
 * card for each stage linking to the sub-page. Counts come from
 * lightweight tRPC queries — same endpoints the sub-pages already
 * use, so no new backend work.
 */

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileInput,
  FlaskConical,
  HelpCircle,
  Lightbulb,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type WorkflowCard = {
  step: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  blurb: string;
  hint: string;
};

const CARDS: WorkflowCard[] = [
  {
    step: 1,
    title: "Ingest",
    icon: FileInput,
    href: "/scraper/ingest",
    blurb:
      "Bring in past-paper PDFs and syllabus documents. Either drop a direct PDF URL (for specific papers the portal listing won't surface) or crawl a portal page to discover them in bulk.",
    hint: "Leaves this workflow — Ingest is shared with non-question pipelines.",
  },
  {
    step: 2,
    title: "Content Hub",
    icon: Radar,
    href: "/admin/question-generation/content-hub",
    blurb:
      "Inventory view of what's been ingested per exam. See how many years of papers, answer keys, syllabi, and notifications you have — and what's missing before you can generate.",
    hint: "Refresh coverage scores with the Universal Discovery runs.",
  },
  {
    step: 3,
    title: "Verification",
    icon: ShieldCheck,
    href: "/admin/question-generation/verification",
    blurb:
      "Review the 6-layer pipeline's verdicts on extracted & AI-generated questions. Filter by exam or status, bulk-approve trusted sources (e.g. official answer keys), edit or reject.",
    hint: "Every decision is audit-logged to question_verifications.",
  },
  {
    step: 4,
    title: "Topic Generation",
    icon: FlaskConical,
    href: "/admin/question-generation/topic-gen",
    blurb:
      "Once a syllabus topic has ≥3 real-paper / textbook seed questions, queue a topic-seeded AI generation job for that node. Output runs through the verification pipeline automatically.",
    hint: "Picker lists every scraped examination, same as /exams.",
  },
  {
    step: 5,
    title: "Questions Library",
    icon: BookOpen,
    href: "/questions",
    blurb:
      "The final pool. Every approved question across every exam — searchable, filterable, with the 6-tier trust badge visible on each row.",
    hint: "Leaves this workflow — shared with exam-session code paths.",
  },
];

export default function QuestionGenerationDashboardPage(): React.ReactElement {
  // Light counters so the hub can show admin-useful numbers at a glance.
  // All three queries are already cached by the sub-pages that use them.
  const verificationSummary = trpc.questionVerification.getSummary.useQuery(undefined, {
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FlaskConical className="size-6" />
          Question Generation
        </h1>
        <p className="text-muted-foreground text-sm">
          End-to-end workflow for building an exam-ready question pool: ingest past papers, verify
          what the pipeline extracted, then generate new topic-seeded questions that match the exam
          fingerprint.
        </p>
      </div>

      {/* Quick-start info box */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex gap-4 py-4">
          <Lightbulb className="text-primary mt-0.5 size-5 shrink-0" />
          <div className="flex-1 space-y-2 text-sm">
            <p className="font-semibold leading-tight">
              Follow these steps in order the first time you set up an exam
            </p>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              <li>
                <strong>Ingest</strong> 2-3 past-paper PDFs (direct URL upload works for Kerala PSC
                Asst. Prof. answer keys).
              </li>
              <li>
                Let the <strong>portal-processing-worker</strong> extract questions to staging.
                Classification is auto-queued after you approve them (next step).
              </li>
              <li>
                In <strong>Verification</strong>, filter by the target exam, flip status to
                &ldquo;Unverified&rdquo;, and click <strong>Approve all</strong>. This also
                auto-queues the <strong>pattern-analysis-worker</strong> which classifies each
                question into subject / topic / difficulty and maps it to a syllabus node.
              </li>
              <li>
                Once any syllabus topic has ≥3 mapped real/textbook seeds, the{" "}
                <strong>Topic Generation</strong> page&rsquo;s Generate button lights up for that
                topic. Click it to queue an AI generation job (runs on the{" "}
                <strong>topic-generation-worker</strong>).
              </li>
              <li>
                Generated questions auto-run through the 6-layer{" "}
                <strong>verification-worker</strong>. Approve them back in Verification. Final pool
                shows up in the <strong>Questions Library</strong>.
              </li>
            </ol>
            <p className="text-muted-foreground pt-1 text-[11px]">
              Need the full reference?{" "}
              <Link
                href={"/admin/question-generation/help" as "/"}
                className="text-primary underline"
              >
                Open the help doc →
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Workflow cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.step} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                      {card.step}
                    </span>
                    <Icon className="size-4" />
                    <span>{card.title}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs leading-relaxed">{card.blurb}</p>
                  <p className="text-muted-foreground text-[10px] italic leading-snug">
                    {card.hint}
                  </p>
                </div>
                <Link href={card.href as "/"}>
                  <Button size="sm" variant="outline" className="h-7 w-full gap-1 text-xs">
                    Open
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Verification stats row — the one thing admins glance at most often */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Verification queue snapshot</CardTitle>
          <Link href={"/admin/question-generation/verification" as "/"}>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
              Open verification
              <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {verificationSummary.isLoading ? (
            [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)
          ) : (
            <>
              <StatChip
                label="Unverified"
                value={verificationSummary.data?.unverified ?? 0}
                tone="neutral"
              />
              <StatChip
                label="Auto-approved"
                value={verificationSummary.data?.auto_approved ?? 0}
                tone="ok"
              />
              <StatChip
                label="Needs review"
                value={verificationSummary.data?.needs_review ?? 0}
                tone="warn"
              />
              <StatChip
                label="Admin approved"
                value={verificationSummary.data?.admin_approved ?? 0}
                tone="ok"
              />
              <StatChip
                label="Rejected"
                value={verificationSummary.data?.rejected ?? 0}
                tone="bad"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Help link footer */}
      <div className="flex items-center justify-between rounded-md border p-3 text-xs">
        <div className="flex items-center gap-2">
          <HelpCircle className="text-muted-foreground size-4" />
          <span className="text-muted-foreground">
            First time here? Read the help doc for the full list of what each worker does and which
            BullMQ queues the pipeline uses.
          </span>
        </div>
        <Link href={"/admin/question-generation/help" as "/"}>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
            Help docs
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "bad" | "neutral";
}): React.ReactElement {
  const ring =
    tone === "ok"
      ? "border-green-500/40"
      : tone === "warn"
        ? "border-amber-500/40"
        : tone === "bad"
          ? "border-red-500/40"
          : "border-border";
  const Tone =
    tone === "ok" ? CheckCircle2 : tone === "warn" ? Sparkles : tone === "bad" ? Sparkles : Badge;
  return (
    <div className={`flex flex-col gap-1 rounded-md border p-3 ${ring}`}>
      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold leading-none">{value.toLocaleString()}</span>
        {tone !== "neutral" && typeof Tone === "function" && Tone !== Badge && (
          <Tone className="text-muted-foreground size-3" />
        )}
      </div>
    </div>
  );
}
