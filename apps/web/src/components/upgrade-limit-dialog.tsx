"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, ArrowRight, Zap } from "lucide-react";

interface UpgradeLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  used: number;
  limit: number;
  planName: string;
}

export function UpgradeLimitDialog({
  open,
  onOpenChange,
  used,
  limit,
  planName,
}: UpgradeLimitDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Zap className="size-7 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle className="text-xl">Upgrade Your Plan</DialogTitle>
          <DialogDescription className="text-balance">
            You&apos;ve used all {used}/{limit} exam generations available on your{" "}
            <span className="font-semibold">{planName}</span> plan this month.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 text-muted-foreground rounded-lg border p-3 text-center text-sm">
          Upgrade to unlock unlimited exam generation, more AI features, and priority support.
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild size="lg" className="w-full gap-2">
            <Link href="/pricing">
              <Crown className="size-4" />
              View Plans & Upgrade
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to manage the upgrade limit dialog state.
 * Returns: [showUpgradeDialog, UpgradeDialogElement, triggerUpgradeDialog]
 */
export function useUpgradeLimitDialog(): {
  showUpgradeDialog: (quota: { used: number; limit: number; planName: string }) => void;
  UpgradeDialog: React.ReactElement | null;
} {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    used: number;
    limit: number;
    planName: string;
  }>({ open: false, used: 0, limit: 0, planName: "Free" });

  const showUpgradeDialog = (quota: { used: number; limit: number; planName: string }): void => {
    setDialogState({ open: true, ...quota });
  };

  const UpgradeDialog = dialogState.open ? (
    <UpgradeLimitDialog
      open={dialogState.open}
      onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
      used={dialogState.used}
      limit={dialogState.limit}
      planName={dialogState.planName}
    />
  ) : null;

  return { showUpgradeDialog, UpgradeDialog };
}
