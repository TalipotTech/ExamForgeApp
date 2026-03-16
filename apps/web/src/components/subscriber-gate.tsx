"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, ArrowRight } from "lucide-react";

interface SubscriberGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  featureName?: string;
}

export function SubscriberGate({
  children,
  fallback,
  featureName,
}: SubscriberGateProps): React.ReactElement {
  const { data: session } = useSession();
  const isSubscriber =
    (session?.user as { isSubscriber?: boolean } | undefined)?.isSubscriber ?? false;
  const isAdmin = ["admin", "superadmin"].includes(
    (session?.user as { role?: string } | undefined)?.role ?? "",
  );

  if (isSubscriber || isAdmin) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center py-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Crown className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="mb-1 font-semibold">
          {featureName ? `${featureName} requires a subscription` : "Subscriber Feature"}
        </h3>
        <p className="text-muted-foreground mb-4 max-w-sm text-sm">
          Upgrade your plan to unlock {featureName?.toLowerCase() ?? "this feature"} and other
          premium benefits.
        </p>
        <Link href={"/pricing" as "/"}>
          <Button className="gap-2">
            Upgrade Plan
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
