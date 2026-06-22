"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";

type Tab = "formatted" | "raw";

type PoolShareCalc = {
  formula?: string;
  weightedScore?: number;
  allCreatorsScore?: number;
  totalPoolInr?: number;
  capPaisa?: number;
  capApplied?: boolean;
};

type Breakdown = {
  freeViewCount?: number;
  totalWatchMinutes?: number;
  weightedScore?: number;
  allCreatorsScore?: number;
  poolShareCalc?: PoolShareCalc;
  formula?: string;
};

function paisaToInr(value: number | null | undefined): string {
  if (value == null) return "₹0";
  return `₹${(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-IN");
}

function formatPercent(num: number | null | undefined, denom: number | null | undefined): string {
  if (num == null || !denom) return "—";
  return `${((num / denom) * 100).toFixed(2)}%`;
}

export function BreakdownView({ value }: { value: Record<string, unknown> }): React.ReactElement {
  const [tab, setTab] = useState<Tab>("formatted");

  // Cast safely — every nested field is optional in the typed view, so
  // missing or unexpected shapes still render gracefully.
  const breakdown = value as Breakdown;
  const calc = breakdown.poolShareCalc ?? {};

  const formattedJson = useMemo(() => JSON.stringify(value, null, 2), [value]);

  return (
    <div className="space-y-2">
      <div className="bg-muted/40 inline-flex items-center gap-1 rounded-md p-0.5 text-xs">
        <TabButton active={tab === "formatted"} onClick={() => setTab("formatted")}>
          Formatted
        </TabButton>
        <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
          Raw JSON
        </TabButton>
      </div>

      {tab === "formatted" ? (
        <div className="bg-muted/30 space-y-3 rounded-md p-3 text-sm">
          <Section title="Inputs">
            <Row label="Free views" value={formatNumber(breakdown.freeViewCount)} />
            <Row label="Watch minutes" value={formatNumber(breakdown.totalWatchMinutes)} />
          </Section>

          <Section title="Score">
            <Row label="Weighted score" value={(breakdown.weightedScore ?? 0).toFixed(2)} />
            <Row
              label="All creators score (denominator)"
              value={(breakdown.allCreatorsScore ?? 0).toFixed(2)}
            />
            <Row
              label="Share of denominator"
              value={formatPercent(breakdown.weightedScore, breakdown.allCreatorsScore)}
            />
          </Section>

          <Section title="Pool math">
            <Row label="Total pool" value={paisaToInr(calc.totalPoolInr)} />
            <Row label="Per-creator cap (25%)" value={paisaToInr(calc.capPaisa)} />
            <Row
              label="Cap applied"
              value={
                calc.capApplied ? (
                  <Badge className="bg-amber-100 text-amber-800">Yes — capped at 25%</Badge>
                ) : (
                  <Badge variant="outline">No</Badge>
                )
              }
            />
          </Section>

          {(calc.formula || breakdown.formula) && (
            <Section title="Formula">
              {calc.formula && (
                <code className="bg-background block rounded border px-2 py-1 font-mono text-xs">
                  {calc.formula}
                </code>
              )}
              {breakdown.formula && (
                <code className="bg-background block rounded border px-2 py-1 font-mono text-xs">
                  {breakdown.formula}
                </code>
              )}
            </Section>
          )}
        </div>
      ) : (
        <pre className="bg-muted/40 max-h-80 overflow-auto rounded-md p-3 font-mono text-xs leading-snug">
          {formattedJson}
        </pre>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
