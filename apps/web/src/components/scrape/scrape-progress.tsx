"use client";

import { Globe, FileSearch, Copy, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";

type Props = {
  jobId: string;
  sourceId: string;
  onComplete: () => void;
};

const PHASE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  crawling: {
    label: "Crawling pages",
    icon: <Globe className="size-3.5" />,
    color: "text-blue-600",
  },
  extracting: {
    label: "Extracting questions",
    icon: <FileSearch className="size-3.5" />,
    color: "text-purple-600",
  },
  deduplicating: {
    label: "Checking duplicates",
    icon: <Copy className="size-3.5" />,
    color: "text-orange-600",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="size-3.5" />,
    color: "text-green-600",
  },
  failed: {
    label: "Failed",
    icon: <AlertCircle className="size-3.5" />,
    color: "text-red-600",
  },
};

export function ScrapeProgress({
  jobId,
  sourceId: _sourceId,
  onComplete,
}: Props): React.ReactElement {
  const progressQuery = trpc.scrape.getJobProgress.useQuery(
    { jobId },
    {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data?.progress) return 2000;
        const status = data.progress.status;
        if (status === "completed" || status === "failed") {
          return false;
        }
        return 2000;
      },
    },
  );

  const data = progressQuery.data;
  const progress = data?.progress;

  // Notify parent when done
  if (progress?.status === "completed" || progress?.status === "failed") {
    // Use a microtask to avoid updating parent during render
    queueMicrotask(() => onComplete());
  }

  if (!jobId) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Starting scrape...
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Initializing job...
      </div>
    );
  }

  const phase = PHASE_CONFIG[progress.status] ?? {
    label: "Processing",
    icon: <Loader2 className="size-3.5 animate-spin" />,
    color: "text-blue-600",
  };
  const percent =
    progress.pagesTotal > 0 ? Math.round((progress.pagesVisited / progress.pagesTotal) * 100) : 0;

  return (
    <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
      {/* Phase header */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 text-sm font-medium ${phase.color}`}>
          {phase.icon}
          {phase.label}
        </div>
        {progress.status !== "completed" && progress.status !== "failed" && (
          <span className="text-muted-foreground text-xs">{percent}%</span>
        )}
      </div>

      {/* Progress bar */}
      {progress.status !== "completed" && progress.status !== "failed" && (
        <Progress value={percent} className="h-1.5" />
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Pages: </span>
          <span className="font-medium">
            {progress.pagesVisited}/{progress.pagesTotal}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Questions: </span>
          <span className="font-medium text-green-600">{progress.questionsFound}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Duplicates: </span>
          <span className="font-medium text-yellow-600">{progress.duplicatesSkipped}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Errors: </span>
          <span className={`font-medium ${progress.errorsCount > 0 ? "text-red-600" : ""}`}>
            {progress.errorsCount}
          </span>
        </div>
      </div>

      {/* Current page */}
      {progress.currentPage && progress.status !== "completed" && progress.status !== "failed" && (
        <p className="text-muted-foreground truncate text-xs">Processing: {progress.currentPage}</p>
      )}

      {/* Failed reason */}
      {data?.failedReason && <p className="text-xs text-red-600">Error: {data.failedReason}</p>}
    </div>
  );
}
