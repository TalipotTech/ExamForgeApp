"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

function formatInr(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN")}`;
}

export default function MyPurchasesPage(): React.ReactElement {
  const purchasesQuery = trpc.marketplace.myPurchases.useQuery({ limit: 100 });

  if (purchasesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (purchasesQuery.error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {purchasesQuery.error.message.includes("FEATURE_DISABLED")
              ? "The marketplace is not yet enabled."
              : purchasesQuery.error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const purchases = purchasesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Package className="size-6" />
          My Purchases
        </h1>
        <p className="text-muted-foreground text-sm">
          Everything you&apos;ve bought from the marketplace.
        </p>
      </div>

      {purchases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Package className="text-muted-foreground size-8" />
            <p className="font-medium">No purchases yet.</p>
            <Button asChild>
              <Link href="/marketplace">Browse the marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {purchases.map((purchase) => (
            <Card key={purchase.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex-1">
                  <div className="font-medium">Listing {purchase.listingId.slice(0, 8)}</div>
                  <div className="text-muted-foreground text-xs">
                    {purchase.purchasedAt
                      ? new Date(purchase.purchasedAt).toLocaleDateString("en-IN")
                      : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatInr(purchase.amountInr)}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {purchase.status}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/marketplace/${purchase.listingId}`}>View</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
