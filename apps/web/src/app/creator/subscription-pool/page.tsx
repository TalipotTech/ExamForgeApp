"use client";

import { useMemo } from "react";
import { ChevronRight, Coins, Eye, Timer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

const STALE_TIME = 60_000;

function paisaToInr(value: number | null | undefined): string {
  if (value == null) return "₹0";
  return `₹${(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-IN");
}

function periodLabel(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return period;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function CreatorSubscriptionPoolPage(): React.ReactElement {
  const { data, isLoading } = trpc.subscriptionPool.myHistory.useQuery(
    { limit: 24 },
    { staleTime: STALE_TIME },
  );

  const totalEarned = useMemo(
    () => (data?.rows ?? []).reduce((acc, row) => acc + (row.poolShareInr ?? 0), 0),
    [data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subscription Pool</h1>
        <p className="text-muted-foreground text-sm">
          70% of monthly subscription revenue is split across creators based on your free-tier views
          and watch minutes. Capped at 25% per creator per month.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Coins className="size-4" />}
          label="Lifetime pool earnings"
          value={paisaToInr(totalEarned)}
        />
        <KpiCard
          icon={<Eye className="size-4" />}
          label="Periods participated"
          value={formatNumber(data?.rows.length)}
        />
        <KpiCard
          icon={<Timer className="size-4" />}
          label="Most recent payout"
          value={
            data?.rows[0]?.distributedAt
              ? new Date(data.rows[0].distributedAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—"
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data || data.rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No subscription-pool earnings yet. Once your free content gets viewed during a paid
              month, your share will appear here.
            </p>
          ) : (
            <div className="space-y-3">
              {data.rows.map((row) => (
                <PoolRow key={row.id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

type PoolHistoryRow = {
  id: string;
  periodMonth: string;
  freeViewCount: number;
  totalWatchMinutes: number;
  weightedScore: number;
  poolShareInr: number;
  totalPoolInr: number;
  status: string;
  distributedAt: Date | string | null;
  breakdown: Record<string, unknown> | null;
  createdAt: Date | string;
};

function PoolRow({ row }: { row: PoolHistoryRow }): React.ReactElement {
  const sharePct =
    row.totalPoolInr > 0 ? ((row.poolShareInr / row.totalPoolInr) * 100).toFixed(2) : "0.00";
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2 text-left">
        <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{periodLabel(row.periodMonth)}</span>
            <span className="text-muted-foreground font-mono text-xs">{row.periodMonth}</span>
            {row.status !== "distributed" && (
              <Badge variant="outline" className="text-xs">
                {row.status}
              </Badge>
            )}
          </div>
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
    <pre className="bg-muted/40 max-h-72 overflow-auto p-3 font-mono text-xs leading-snug">
      {formatted}
    </pre>
  );
}
