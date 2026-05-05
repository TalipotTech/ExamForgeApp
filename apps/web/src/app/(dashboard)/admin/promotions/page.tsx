"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, ExternalLink, ImageOff } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@examforge/api/trpc";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type TabValue = "pending" | "active" | "expired" | "rejected";

const TABS: { value: TabValue; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminPromotionsPage(): React.ReactElement {
  const [tab, setTab] = useState<TabValue>("pending");
  const [rejectFor, setRejectFor] = useState<{ id: string; headline: string | null } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [metricsId, setMetricsId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-muted-foreground text-sm">
            Review submitted promotions, manage active campaigns, and audit rejected ones.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingTab onRejectRequest={(p) => setRejectFor(p)} />
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <ActiveTab onMetrics={(id) => setMetricsId(id)} />
        </TabsContent>
        <TabsContent value="expired" className="mt-4">
          <ExpiredTab onMetrics={(id) => setMetricsId(id)} />
        </TabsContent>
        <TabsContent value="rejected" className="mt-4">
          <RejectedTab />
        </TabsContent>
      </Tabs>

      <RejectDialog
        promotion={rejectFor}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onClose={() => {
          setRejectFor(null);
          setRejectReason("");
        }}
      />

      <MetricsDrawer promotionId={metricsId} onClose={() => setMetricsId(null)} />
    </div>
  );
}

// ─── Pending Tab ─────────────────────────────────────────────

function PendingTab({
  onRejectRequest,
}: {
  onRejectRequest: (p: { id: string; headline: string | null }) => void;
}): React.ReactElement {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.promotion.listPending.useQuery();

  const approve = trpc.promotion.approve.useMutation({
    onSuccess: () => {
      toast.success("Promotion approved");
      void utils.promotion.listPending.invalidate();
      void utils.promotion.listActive.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <PromotionList
      isLoading={isLoading}
      rows={data ?? []}
      emptyText="No promotions awaiting review"
      renderActions={(row) => (
        <>
          <Button
            size="sm"
            onClick={() => approve.mutate({ promotionId: row.id })}
            disabled={approve.isPending}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRejectRequest({ id: row.id, headline: row.headline ?? null })}
          >
            Reject
          </Button>
        </>
      )}
    />
  );
}

// ─── Active Tab ──────────────────────────────────────────────

function ActiveTab({ onMetrics }: { onMetrics: (id: string) => void }): React.ReactElement {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.promotion.listActive.useQuery();

  const pause = trpc.promotion.pause.useMutation({
    onSuccess: () => {
      toast.success("Promotion paused");
      void utils.promotion.listActive.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resume = trpc.promotion.resume.useMutation({
    onSuccess: () => {
      toast.success("Promotion resumed");
      void utils.promotion.listActive.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <PromotionList
      isLoading={isLoading}
      rows={data ?? []}
      emptyText="No active or paused promotions"
      renderActions={(row) => (
        <>
          {row.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => pause.mutate({ promotionId: row.id })}
              disabled={pause.isPending}
            >
              Pause
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => resume.mutate({ promotionId: row.id })}
              disabled={resume.isPending}
            >
              Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onMetrics(row.id)}>
            Metrics
          </Button>
        </>
      )}
    />
  );
}

// ─── Expired Tab ─────────────────────────────────────────────

function ExpiredTab({ onMetrics }: { onMetrics: (id: string) => void }): React.ReactElement {
  const { data, isLoading } = trpc.promotion.listExpired.useQuery();

  return (
    <PromotionList
      isLoading={isLoading}
      rows={data ?? []}
      emptyText="No expired promotions yet"
      renderActions={(row) => (
        <Button size="sm" variant="ghost" onClick={() => onMetrics(row.id)}>
          Metrics
        </Button>
      )}
    />
  );
}

// ─── Rejected Tab ────────────────────────────────────────────

function RejectedTab(): React.ReactElement {
  const { data, isLoading } = trpc.promotion.listRejected.useQuery();

  return (
    <PromotionList
      isLoading={isLoading}
      rows={data ?? []}
      emptyText="No rejected promotions"
      renderActions={(row) => {
        const rej = "rejection" in row ? row.rejection : null;
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Info className="mr-1 h-3.5 w-3.5" />
                Why rejected?
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              {rej?.reason ? (
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Reason</div>
                  <p className="text-muted-foreground">{rej.reason}</p>
                  <div className="text-muted-foreground border-t pt-2 text-xs">
                    {rej.adminName ? `By ${rej.adminName} · ` : ""}
                    {new Date(rej.rejectedAt).toLocaleString()}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No reason recorded for this rejection.
                </p>
              )}
            </PopoverContent>
          </Popover>
        );
      }}
    />
  );
}

// ─── Shared Promotion List ───────────────────────────────────

type PromotionRow = {
  id: string;
  headline: string | null;
  description: string | null;
  promotionType: string;
  status: string;
  bannerImageUrl: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  budgetType: string;
  budgetAmountInr: number | null;
  spentAmountInr: number | null;
  impressions: number | null;
  clicks: number | null;
  targetExams: string[] | null;
  targetSubjects: string[] | null;
  creatorDisplayName: string | null;
  creatorAvatarUrl: string | null;
  rejection?: {
    reason: string;
    rejectedAt: Date | string;
    adminName: string | null;
  } | null;
};

function PromotionList<T extends PromotionRow>({
  isLoading,
  rows,
  emptyText,
  renderActions,
}: {
  isLoading: boolean;
  rows: T[];
  emptyText: string;
  renderActions: (row: T) => React.ReactNode;
}): React.ReactElement {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-8 text-center text-sm">
          Loading promotions...
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-8 text-center text-sm">
          {emptyText}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <PromotionRowCard key={row.id} row={row} actions={renderActions(row)} />
      ))}
    </div>
  );
}

function PromotionRowCard({
  row,
  actions,
}: {
  row: PromotionRow;
  actions: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
        <Thumbnail src={row.bannerImageUrl} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {row.promotionType}
            </Badge>
            <StatusBadge status={row.status} />
            <span className="text-muted-foreground text-xs">
              {row.creatorDisplayName ?? "Unknown creator"}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="truncate font-semibold">{row.headline ?? "(no headline)"}</h3>
            {row.description && (
              <p className="text-muted-foreground line-clamp-2 text-sm">{row.description}</p>
            )}
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              Budget: {formatBudget(row.budgetType, row.budgetAmountInr)} · spent{" "}
              {formatInr(row.spentAmountInr)}
            </span>
            <span>
              {formatDate(row.startsAt)} → {formatDate(row.endsAt)}
            </span>
            {row.targetExams && row.targetExams.length > 0 && (
              <span>Exams: {row.targetExams.slice(0, 3).join(", ")}</span>
            )}
          </div>

          {row.ctaUrl && (
            <a
              href={row.ctaUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              {row.ctaText || row.ctaUrl}
            </a>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2">{actions}</div>
      </CardContent>
    </Card>
  );
}

function Thumbnail({ src }: { src: string | null }): React.ReactElement {
  if (!src) {
    return (
      <div className="bg-muted text-muted-foreground flex h-20 w-32 shrink-0 items-center justify-center rounded">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img src={src} alt="" className="h-20 w-32 shrink-0 rounded object-cover" loading="lazy" />
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    active: "bg-green-100 text-green-800",
    paused: "bg-orange-100 text-orange-800",
    expired: "bg-gray-100 text-gray-700",
    completed: "bg-gray-100 text-gray-700",
    rejected: "bg-red-100 text-red-800",
  };
  return <Badge className={map[status] ?? ""}>{status}</Badge>;
}

function formatInr(value: number | null | undefined): string {
  if (value == null) return "₹0";
  return `₹${value.toLocaleString("en-IN")}`;
}

function formatBudget(type: string, amount: number | null): string {
  if (amount == null) return "—";
  switch (type) {
    case "impressions":
      return `${amount.toLocaleString("en-IN")} impressions`;
    case "clicks":
      return `${amount.toLocaleString("en-IN")} clicks`;
    case "flat":
    default:
      return formatInr(amount);
  }
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Reject Dialog ───────────────────────────────────────────

function RejectDialog({
  promotion,
  reason,
  onReasonChange,
  onClose,
}: {
  promotion: { id: string; headline: string | null } | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const utils = trpc.useUtils();
  const reject = trpc.promotion.reject.useMutation({
    onSuccess: () => {
      toast.success("Promotion rejected");
      void utils.promotion.listPending.invalidate();
      void utils.promotion.listRejected.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const open = promotion !== null;
  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject promotion</DialogTitle>
          <DialogDescription>
            {promotion?.headline ?? "(no headline)"} — the creator will see this reason in their
            dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g. Banner image violates policy: includes competitor branding."
            rows={4}
            maxLength={1000}
          />
          {tooShort && (
            <p className="text-destructive text-xs">Reason must be at least 3 characters.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={trimmed.length < 3 || reject.isPending}
            onClick={() => {
              if (!promotion) return;
              reject.mutate({ promotionId: promotion.id, reason: trimmed });
            }}
          >
            {reject.isPending ? "Rejecting..." : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Metrics Drawer ──────────────────────────────────────────

function MetricsDrawer({
  promotionId,
  onClose,
}: {
  promotionId: string | null;
  onClose: () => void;
}): React.ReactElement {
  const open = promotionId !== null;
  const { data, isLoading } = trpc.promotion.getMetrics.useQuery(
    { promotionId: promotionId ?? "" },
    { enabled: open },
  );

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Promotion metrics</SheetTitle>
          <SheetDescription>
            Live counters and recent admin actions for this campaign.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {isLoading || !data ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading metrics...</p>
          ) : (
            <MetricsBody data={data} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type MetricsData = inferRouterOutputs<AppRouter>["promotion"]["getMetrics"];

function MetricsBody({ data }: { data: MetricsData }): React.ReactElement {
  const tiles = useMemo(
    () => [
      { label: "Impressions", value: (data.impressions ?? 0).toLocaleString("en-IN") },
      { label: "Clicks", value: (data.clicks ?? 0).toLocaleString("en-IN") },
      {
        label: "CTR",
        value: `${(data.derived.ctr * 100).toFixed(2)}%`,
      },
      { label: "Conversions", value: (data.conversions ?? 0).toLocaleString("en-IN") },
      {
        label: "Conv. rate",
        value: `${(data.derived.conversionRate * 100).toFixed(2)}%`,
      },
      {
        label: "Spent",
        value: formatInr(data.spentAmountInr),
        sub: `of ${formatBudget(data.budgetType, data.budgetAmountInr)}`,
      },
    ],
    [data],
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="text-muted-foreground text-xs uppercase">{data.promotionType}</div>
        <h3 className="mt-1 font-semibold">{data.headline ?? "(no headline)"}</h3>
        <div className="text-muted-foreground text-xs">
          {data.creatorDisplayName ?? "Unknown creator"} · {formatDate(data.startsAt)} →{" "}
          {formatDate(data.endsAt)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-md border p-3">
            <div className="text-muted-foreground text-xs">{tile.label}</div>
            <div className="text-lg font-semibold">{tile.value}</div>
            {tile.sub && <div className="text-muted-foreground text-xs">{tile.sub}</div>}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-muted-foreground text-xs uppercase">Budget</div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded">
          <div
            className="bg-primary h-full"
            style={{ width: `${(data.derived.budgetUsedPct * 100).toFixed(1)}%` }}
          />
        </div>
        <div className="text-muted-foreground text-xs">
          {formatInr(data.spentAmountInr)} spent · {formatInr(data.derived.budgetRemainingInr)}{" "}
          remaining
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-muted-foreground text-xs uppercase">Recent admin actions</div>
        {data.recentActions.length === 0 ? (
          <p className="text-muted-foreground text-xs">No actions logged yet.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {data.recentActions.map((entry) => {
              const reason = (entry.details as { reason?: string } | null)?.reason;
              return (
                <li key={entry.id} className="rounded border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground">{entry.adminName ?? "Unknown admin"}</div>
                  {reason && <div className="text-muted-foreground mt-1">“{reason}”</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
