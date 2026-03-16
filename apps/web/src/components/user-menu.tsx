"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, User, Crown, Sparkles, Zap } from "lucide-react";

const PLAN_BADGE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  free: {
    label: "Free",
    icon: <Zap className="size-2.5" />,
    className: "bg-muted text-muted-foreground hover:bg-muted border-border",
  },
  pro: {
    label: "Pro",
    icon: <Sparkles className="size-2.5" />,
    className:
      "bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  premium: {
    label: "Premium",
    icon: <Crown className="size-2.5" />,
    className:
      "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  },
};

export function UserMenu(): React.ReactElement | null {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  // Fetch current subscription to show plan badge
  const currentSubQuery = trpc.payment.getCurrentSubscription.useQuery(undefined, {
    enabled: isLoggedIn,
    staleTime: 5 * 60_000,
  });

  if (!session?.user) return null;

  const emailVerified = (session.user as { emailVerified?: boolean }).emailVerified;
  const planName = currentSubQuery.data?.subscription?.planName ?? "free";
  const badgeConfig = PLAN_BADGE_CONFIG[planName] ?? PLAN_BADGE_CONFIG.free!;

  return (
    <div className="flex items-center gap-3">
      {/* Plan badge */}
      <Link href="/pricing">
        <Badge
          variant="outline"
          className={`gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeConfig.className}`}
        >
          {badgeConfig.icon}
          {badgeConfig.label}
        </Badge>
      </Link>

      <Link
        href="/dashboard/profile"
        className="hover:text-foreground flex items-center gap-2 text-sm transition-colors"
      >
        <User className="text-muted-foreground size-4" />
        <span className="text-foreground/80 hidden sm:inline">{session.user.name}</span>
        {emailVerified === false && (
          <Badge variant="destructive" className="hidden text-[10px] sm:inline-flex">
            Unverified
          </Badge>
        )}
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => signOut({ callbackUrl: "/" })}
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
