"use client";

import { AlertTriangle, ArrowRight, Crown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface UpgradePlanBannerProps {
  used: number;
  limit: number;
  planName: string;
  /** "inline" renders inside dialogs, "dialog" is the standalone popup */
  variant?: "inline" | "dialog";
}

export function UpgradePlanBanner({
  used,
  limit,
  planName,
  variant = "inline",
}: UpgradePlanBannerProps): React.ReactElement | null {
  const isExhausted = used >= limit;
  const isNearLimit = used >= limit - 1 && !isExhausted;

  if (!isExhausted && !isNearLimit) return null;

  if (isExhausted) {
    return (
      <div
        className={`border-destructive/50 bg-destructive/10 rounded-lg border-2 p-4 ${variant === "dialog" ? "mx-0" : ""}`}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-destructive text-sm font-semibold">Exam generation limit reached</p>
            <p className="text-muted-foreground text-sm">
              You&apos;ve used all {limit} exam{limit > 1 ? "s" : ""} on your{" "}
              <span className="font-medium">{planName}</span> plan this month ({used}/{limit}).
            </p>
            <Button asChild size="sm" className="mt-1 gap-1.5">
              <Link href="/pricing">
                <Crown className="size-3.5" />
                Upgrade Plan
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Near limit warning
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <span className="font-medium">
            {used}/{limit} exams used
          </span>{" "}
          on {planName} plan.{" "}
          <Link
            href="/pricing"
            className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
          >
            Upgrade for more
          </Link>
        </p>
      </div>
    </div>
  );
}
