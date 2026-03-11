"use client";

import { useState } from "react";
import {
  Globe,
  Play,
  Clock,
  AlertCircle,
  CheckCircle2,
  Pause,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AddSourceDialog } from "./add-source-dialog";
import { DeleteSourceDialog } from "./delete-source-dialog";
import { ScrapeProgress } from "./scrape-progress";

type Source = {
  id: string;
  name: string;
  url: string;
  status: string;
  lastScrapedAt: string | null;
  questionsCount: number;
  config: Record<string, unknown>;
  examId: string | null;
  examName: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="size-3" />,
    className: "bg-muted text-muted-foreground",
  },
  active: {
    label: "Active",
    icon: <Loader2 className="size-3 animate-spin" />,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="size-3" />,
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  error: {
    label: "Error",
    icon: <AlertCircle className="size-3" />,
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  paused: {
    label: "Paused",
    icon: <Pause className="size-3" />,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
};

function getStatusConfig(status: string): {
  label: string;
  icon: React.ReactNode;
  className: string;
} {
  return (
    STATUS_CONFIG[status] ?? {
      label: "Pending",
      icon: <Clock className="size-3" />,
      className: "bg-muted text-muted-foreground",
    }
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const cfg = getStatusConfig(status);
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

export function SourceList(): React.ReactElement {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editSource, setEditSource] = useState<Source | null>(null);
  const [deleteSource, setDeleteSource] = useState<Source | null>(null);
  const [activeJobs, setActiveJobs] = useState<Record<string, string>>({});

  const sourcesQuery = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.some((s) => s.status === "active");
      return hasActive ? 5000 : false;
    },
  });

  const triggerMutation = trpc.scrape.trigger.useMutation({
    onSuccess: (data, variables) => {
      setActiveJobs((prev) => ({ ...prev, [variables.sourceId]: data.jobId }));
      sourcesQuery.refetch();
    },
  });

  function handleTrigger(sourceId: string): void {
    triggerMutation.mutate({ sourceId });
  }

  function handleJobComplete(sourceId: string): void {
    setActiveJobs((prev) => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
    sourcesQuery.refetch();
  }

  if (sourcesQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const sources = sourcesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {sources.length} source{sources.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          Add Source
        </Button>
      </div>

      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="text-muted-foreground/50 mb-4 size-12" />
            <h3 className="text-lg font-medium">No scrape sources yet</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Add a website source to start extracting exam questions automatically.
            </p>
            <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Your First Source
            </Button>
          </CardContent>
        </Card>
      ) : (
        sources.map((source) => (
          <Card key={source.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="text-muted-foreground size-4" />
                    {source.name}
                  </CardTitle>
                  <CardDescription className="max-w-md truncate">{source.url}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={source.status} />
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditSource(source)}
                      title="Edit source"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive size-8"
                      onClick={() => setDeleteSource(source)}
                      title="Delete source"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats row */}
              <div className="flex flex-wrap gap-4 text-sm">
                {source.examName && (
                  <div>
                    <span className="text-muted-foreground">Exam: </span>
                    <span className="font-medium">{source.examName}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Questions: </span>
                  <span className="font-medium">{source.questionsCount}</span>
                </div>
                {source.lastScrapedAt && (
                  <div>
                    <span className="text-muted-foreground">Last scraped: </span>
                    <span className="font-medium">
                      {new Date(source.lastScrapedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {(source.config as { schedule?: { enabled: boolean; cron: string } })?.schedule
                  ?.enabled && (
                  <div className="flex items-center gap-1">
                    <Calendar className="text-muted-foreground size-3" />
                    <span className="text-muted-foreground">Scheduled</span>
                  </div>
                )}
              </div>

              {/* Active progress */}
              {(source.status === "active" || activeJobs[source.id]) && (
                <ScrapeProgress
                  jobId={activeJobs[source.id] ?? ""}
                  sourceId={source.id}
                  onComplete={() => handleJobComplete(source.id)}
                />
              )}

              {/* Trigger button */}
              {source.status !== "active" && !activeJobs[source.id] && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTrigger(source.id)}
                  disabled={triggerMutation.isPending}
                >
                  {triggerMutation.isPending &&
                  triggerMutation.variables?.sourceId === source.id ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 size-4" />
                  )}
                  Start Scrape
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add dialog */}
      <AddSourceDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={() => {
          setAddDialogOpen(false);
          sourcesQuery.refetch();
        }}
      />

      {/* Edit dialog */}
      {editSource && (
        <AddSourceDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditSource(null);
          }}
          editSource={editSource}
          onSuccess={() => {
            setEditSource(null);
            sourcesQuery.refetch();
          }}
        />
      )}

      {/* Delete dialog */}
      {deleteSource && (
        <DeleteSourceDialog
          source={deleteSource}
          onOpenChange={(open) => {
            if (!open) setDeleteSource(null);
          }}
          onSuccess={() => {
            setDeleteSource(null);
            sourcesQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
