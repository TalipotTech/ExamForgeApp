"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatInr(paisa: number | null | undefined): string {
  if (!paisa && paisa !== 0) return "—";
  return `₹${(paisa / 100).toLocaleString("en-IN")}`;
}

function earningBadgeVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "available") return "default";
  if (status === "paid_out") return "secondary";
  if (status === "reversed") return "destructive";
  return "outline";
}

export default function CreatorWalletPage(): React.ReactElement {
  const walletQuery = trpc.creatorEarnings.wallet.useQuery(undefined, { staleTime: 30_000 });
  const historyQuery = trpc.creatorEarnings.history.useQuery({ limit: 100 });
  const [payoutAmount, setPayoutAmount] = useState("");
  const [open, setOpen] = useState(false);

  const requestMutation = trpc.creatorEarnings.requestPayout.useMutation({
    onSuccess: (data) => {
      toast.success(`Payout requested (${data.payoutReference})`);
      setOpen(false);
      setPayoutAmount("");
      void walletQuery.refetch();
      void historyQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (walletQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (walletQuery.error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {walletQuery.error.message.includes("FEATURE_DISABLED")
              ? "The marketplace is not yet enabled."
              : walletQuery.error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const wallet = walletQuery.data;
  const history = historyQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/dashboard/creator">
            <ArrowLeft className="mr-1 size-4" />
            Creator Hub
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <WalletIcon className="size-6" />
          Wallet
        </h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInr(wallet?.balanceInr)}</div>
            <p className="text-muted-foreground text-xs">Ready for payout</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInr(wallet?.pendingInr)}</div>
            <p className="text-muted-foreground text-xs">Clears after 7-day cooldown</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Lifetime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInr(wallet?.lifetimeEarnedInr)}</div>
            <p className="text-muted-foreground text-xs">
              Paid out: {formatInr(wallet?.lifetimePaidOutInr)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!wallet || wallet.balanceInr <= 0}>Request payout</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request payout</DialogTitle>
              <DialogDescription>
                Payouts are processed off-platform against the UPI / bank details on your creator
                profile. Leave the amount empty to cash out the full available balance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="1"
                placeholder={`Full (${formatInr(wallet?.balanceInr)})`}
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={requestMutation.isPending}
                onClick={() => {
                  const amt = payoutAmount
                    ? Math.round(Number.parseFloat(payoutAmount) * 100)
                    : undefined;
                  requestMutation.mutate(amt ? { amountInr: amt } : {});
                }}
              >
                {requestMutation.isPending ? "Submitting…" : "Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Earnings history</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading && <Skeleton className="h-16 w-full" />}
          {!historyQuery.isLoading && history.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No earnings yet — your first marketplace sale will appear here.
            </p>
          )}
          {history.length > 0 && (
            <div className="divide-y">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{entry.earningType.replace(/_/g, " ")}</div>
                    <div className="text-muted-foreground text-xs">
                      {entry.description ?? ""}
                      {entry.createdAt
                        ? ` · ${new Date(entry.createdAt).toLocaleDateString("en-IN")}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        entry.amountInr >= 0 ? "font-semibold" : "font-semibold text-red-600"
                      }
                    >
                      {formatInr(entry.amountInr)}
                    </span>
                    <Badge variant={earningBadgeVariant(entry.status)} className="text-[10px]">
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
