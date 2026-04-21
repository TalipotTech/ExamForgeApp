/**
 * Question Generation — grouped admin workflow.
 *
 * Wraps every page under /admin/question-generation with a left
 * sidebar listing the five-step pipeline so admins see the workflow
 * order at a glance and can jump between stages without hunting for
 * entries in the top nav.
 *
 * Sub-routes under this layout (each has its own page.tsx):
 *   .                     — dashboard (overview + quick-start box)
 *   /content-hub          — Step 2: browse the scraped/ingested inventory
 *   /verification         — Step 4: approve / reject per-question
 *   /topic-gen            — Step 5: generate new questions from seeds
 *   /help                 — long-form documentation
 *
 * Step 1 (Ingest) and Step 6 (Questions library) live outside this
 * layout — the sidebar still links to them, but clicking navigates
 * to their own pages. That's intentional: Ingest is reused for
 * non-question data and Questions is a general admin table.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileInput,
  FlaskConical,
  HelpCircle,
  LayoutDashboard,
  Radar,
  ShieldCheck,
} from "lucide-react";

type WorkflowStep = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  step: number | "hub" | "help";
  external: boolean;
  description: string;
};

const WORKFLOW: WorkflowStep[] = [
  {
    href: "/admin/question-generation",
    label: "Dashboard",
    icon: LayoutDashboard,
    step: "hub",
    external: false,
    description: "Overview + quick-start",
  },
  {
    href: "/scraper/ingest",
    label: "1. Ingest",
    icon: FileInput,
    step: 1,
    external: true,
    description: "Upload PDFs / discover portal papers",
  },
  {
    href: "/admin/question-generation/content-hub",
    label: "2. Content Hub",
    icon: Radar,
    step: 2,
    external: false,
    description: "Inventory + completeness tracker",
  },
  {
    href: "/admin/question-generation/verification",
    label: "3. Verification",
    icon: ShieldCheck,
    step: 3,
    external: false,
    description: "Review & approve questions",
  },
  {
    href: "/admin/question-generation/topic-gen",
    label: "4. Topic Generation",
    icon: FlaskConical,
    step: 4,
    external: false,
    description: "Generate from real-paper seeds",
  },
  {
    href: "/questions",
    label: "5. Questions Library",
    icon: BookOpen,
    step: 5,
    external: true,
    description: "Browse the final pool",
  },
  {
    href: "/admin/question-generation/help",
    label: "Help",
    icon: HelpCircle,
    step: "help",
    external: false,
    description: "How the pipeline works",
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/question-generation") return pathname === "/admin/question-generation";
  return pathname.startsWith(href);
}

export default function QuestionGenerationLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Left sidebar — sticky within the /admin/question-generation/** layout */}
      <aside className="shrink-0 md:w-60">
        <div className="md:sticky md:top-20">
          <div className="mb-3 flex items-center gap-2 px-2">
            <FlaskConical className="text-primary size-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Question Generation
            </span>
          </div>
          <nav className="flex flex-col gap-0.5">
            {WORKFLOW.map((w, idx) => {
              const Icon = w.icon;
              const active = isActive(pathname, w.href);
              // Draw a subtle separator before Help so it reads as
              // a supporting item rather than a workflow step.
              const showSeparator = w.step === "help" && idx > 0;
              return (
                <div key={w.href}>
                  {showSeparator && <div className="border-border my-2 border-t" />}
                  <Link
                    href={w.href as "/"}
                    className={`flex items-start gap-2 rounded-md px-2 py-2 text-xs transition-colors ${
                      active
                        ? "bg-accent text-foreground font-medium"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                    title={
                      w.external ? `${w.description} (opens outside this workflow)` : w.description
                    }
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0" />
                    <div className="flex flex-col leading-tight">
                      <span>{w.label}</span>
                      <span className="text-muted-foreground mt-0.5 text-[10px] font-normal">
                        {w.description}
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
