"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, PlayCircle, RefreshCw, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const STALE_TIME = 60_000;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function paisaToInr(value: number | null | undefined): string {
  if (value == null) return "₹0";
  return `₹${(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-IN");
}

export default function AdminSubscriptionPoolPage(): React.ReactElement {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runPeriod, setRunPeriod] = useState("");

  const utils = trpc.useUtils();

  const periodsQuery = trpc.subscriptionPool.listPeriods.useQuery(undefined, {
    staleTime: STALE_TIME,
  });

  const previousMonth = periodsQuery.data?.previousMonth ?? "";

  const triggerMutation = trpc.subscriptionPool.triggerRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Queued distribution for ${data.periodMonth} (job ${data.jobId})`);
      setRunDialogOpen(false);
      void utils.subscriptionPool.listPeriods.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openRunDialog(): void {
    setRunPeriod(previousMonth);
    setRunDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Subscription Pool</h1>
          <p className="text-muted-foreground text-sm">
            70% of monthly subscription revenue is split across creators based on free-tier views
            and watch minutes. Each creator capped at 25% of the pool.
          </p>
        </div>
        <Button
          onClick={openRunDialog}
          disabled={!previousMonth || triggerMutation.isPending}
          className="gap-2"
        >
          <PlayCircle className="h-4 w-4" />
          Run for {previousMonth || "previous month"}
        </Button>
      </div>

      <PeriodList
        periods={periodsQuery.data?.periods ?? []}
        isLoading={periodsQuery.isLoading}
        selectedPeriod={selectedPeriod}
        onSelect={(p) => setSelectedPeriod((cur) => (cur === p ? null : p))}
      />

      {selectedPeriod && <PeriodDrillDown periodMonth={selectedPeriod} />}

      <RunDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        periodMonth={runPeriod}
        onPeriodChange={setRunPeriod}
        onSubmit={() => {
          if (!PERIOD_RE.test(runPeriod)) {
            toast.error("periodMonth must be YYYY-MM");
            return;
          }
          triggerMutation.mutate({ periodMonth: runPeriod });
        }}
        isPending={triggerMutation.isPending}
      />
    </div>
  );
}

// ─── Period list ──────────────────────────────────────────────────

type PeriodSummary = {
  periodMonth: string;
  totalPoolInr: number;
  distributedAmountInr: number;
  creatorCount: number;
  distributedAt: Date | null | string;
};

function PeriodList({
  periods,
  isLoading,
  selectedPeriod,
  onSelect,
}: {
  periods: PeriodSummary[];
  isLoading: boolean;
  selectedPeriod: string | null;
  onSelect: (period: string) => void;
}): React.ReactElement {
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (periods.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-10 text-center text-sm">
          No subscription-pool distributions yet. Use &quot;Run for previous month&quot; to trigger
          the first one.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3 font-medium">Period</th>
              <th className="p-3 text-right font-medium">Total pool</th>
              <th className="p-3 text-right font-medium">Distributed</th>
              <th className="p-3 text-right font-medium">Creators</th>
              <th className="p-3 font-medium">Last run</th>
              <th className="p-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {periods.map((row) => {
              const isSelected = selectedPeriod === row.periodMonth;
              return (
                <tr
                  key={row.periodMonth}
                  className="hover:bg-muted/40 cursor-pointer border-b"
                  onClick={() => onSelect(row.periodMonth)}
                >
                  <td className="p-3 font-mono">{row.periodMonth}</td>
                  <td className="p-3 text-right">{paisaToInr(row.totalPoolInr)}</td>
                  <td className="p-3 text-right">{paisaToInr(row.distributedAmountInr)}</td>
                  <td className="p-3 text-right">{formatNumber(row.creatorCount)}</td>
                  <td className="text-muted-foreground p-3 text-xs">
                    {row.distributedAt ? new Date(row.distributedAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {isSelected ? (
                      <ChevronDown className="ml-auto h-4 w-4" />
                    ) : (
                      <ChevronRight className="ml-auto h-4 w-4" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Period drill-down ────────────────────────────────────────────

function PeriodDrillDown({ periodMonth }: { periodMonth: string }): React.ReactElement {
  const { data, isLoading } = trpc.subscriptionPool.byPeriod.useQuery(
    { periodMonth },
    { staleTime: STALE_TIME },
  );

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>
            Period <span className="font-mono">{data.periodMonth}</span>
          </span>
          <span className="text-muted-foreground text-sm font-normal">
            <Wallet className="mr-1 inline h-3.5 w-3.5" />
            {paisaToInr(data.distributedAmountInr)} of {paisaToInr(data.totalPoolInr)} ·{" "}
            {data.creatorCount} creator{data.creatorCount === 1 ? "" : "s"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No allocations recorded.</p>
        ) : (
          <div className="space-y-3">
            {data.rows.map((row) => (
              <CreatorBreakdownRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type BreakdownRow = {
  id: string;
  creatorId: string;
  creatorDisplayName: string | null;
  freeViewCount: number;
  totalWatchMinutes: number;
  weightedScore: number;
  poolShareInr: number;
  totalPoolInr: number;
  status: string;
  distributedAt: Date | null | string;
  breakdown: Record<string, unknown> | null;
  createdAt: Date | string;
};

function CreatorBreakdownRow({ row }: { row: BreakdownRow }): React.ReactElement {
  const sharePct =
    row.totalPoolInr > 0 ? ((row.poolShareInr / row.totalPoolInr) * 100).toFixed(2) : "0.00";
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2 text-left">
        <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90 group-data-[state=open]:rotate-90" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{row.creatorDisplayName ?? row.creatorId}</div>
          <div className="text-muted-foreground text-xs">
            {formatNumber(row.freeViewCount)} free views · {formatNumber(row.totalWatchMinutes)}{" "}
            watch min · score {row.weightedScore.toFixed(1)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold">{paisaToInr(row.poolShareInr)}</div>
          <div className="text-muted-foreground text-xs">{sharePct}% of pool</div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <BreakdownJsonViewer value={row.breakdown ?? {}} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function BreakdownJsonViewer({ value }: { value: Record<string, unknown> }): React.ReactElement {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value]);
  return (
    <pre className="bg-muted/40 max-h-80 overflow-auto p-3 font-mono text-xs leading-snug">
      {formatted}
    </pre>
  );
}

// ─── Run dialog ───────────────────────────────────────────────────

function RunDialog({
  open,
  onOpenChange,
  periodMonth,
  onPeriodChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  periodMonth: string;
  onPeriodChange: (next: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}): React.ReactElement {
  const summaryQuery = trpc.subscriptionPool.poolSummary.useQuery(
    { periodMonth },
    { enabled: open && PERIOD_RE.test(periodMonth), staleTime: STALE_TIME },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run subscription-pool distribution</DialogTitle>
          <DialogDescription>
            Idempotent — re-running for the same period is a no-op once the row is marked{" "}
            <code>distributed</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="period-input">Period (YYYY-MM)</Label>
            <Input
              id="period-input"
              value={periodMonth}
              onChange={(e) => onPeriodChange(e.target.value.trim())}
              placeholder="2026-04"
              className="font-mono"
            />
          </div>

          {summaryQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : summaryQuery.data ? (
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subscription revenue</span>
                <span className="font-medium">
                  {paisaToInr(summaryQuery.data.subscriptionRevenueInr)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Pool (70%)</span>
                <span className="font-semibold">{paisaToInr(summaryQuery.data.totalPoolInr)}</span>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!PERIOD_RE.test(periodMonth) || isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Queueing..." : "Queue run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
