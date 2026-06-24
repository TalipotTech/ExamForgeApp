"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function humanLabel(key: string): string {
  return key
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function ImageGenStats(): React.ReactElement {
  const { data, isLoading } = trpc.imageGeneration.getStats.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🖼️ Image Generation Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return <></>;

  const budgetPct = data.budget > 0 ? Math.min(100, (data.totalCost / data.budget) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">🖼️ Image Generation Stats (This Month)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-muted-foreground text-sm">Total Generated</p>
          <p className="text-2xl font-bold">{data.totalCount.toLocaleString()} images</p>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Cost</span>
            <span className="font-medium">
              {formatUsd(data.totalCost)} / {formatUsd(data.budget)} ({Math.round(budgetPct)}%)
            </span>
          </div>
          <div className="bg-muted mt-1 h-2 w-full rounded-full">
            <div
              className={`h-2 rounded-full transition-all ${
                budgetPct >= 90
                  ? "bg-destructive"
                  : budgetPct >= 70
                    ? "bg-yellow-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>

        {data.byModel.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">By Model</p>
            <div className="space-y-1">
              {data.byModel.map((m) => (
                <div key={m.model} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{m.model}</span>
                  <span>
                    {m.count.toLocaleString()} imgs · {formatUsd(m.cost)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.byPurpose.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">By Purpose</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {data.byPurpose.map((p) => (
                <div key={p.purpose} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{humanLabel(p.purpose)}</span>
                  <span>{p.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-muted-foreground flex justify-between border-t pt-2 text-xs">
          <span>Fallback rate: {(data.fallbackRate * 100).toFixed(1)}%</span>
          <span>Avg time: {(data.avgGenerationTimeMs / 1000).toFixed(1)}s</span>
        </div>
      </CardContent>
    </Card>
  );
}
