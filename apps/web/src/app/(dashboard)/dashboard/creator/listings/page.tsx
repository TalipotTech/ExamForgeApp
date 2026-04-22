"use client";

import Link from "next/link";
import { Plus, ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatInr(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN")}`;
}

export default function CreatorListingsPage(): React.ReactElement {
  const listingsQuery = trpc.marketplace.myListings.useQuery({ limit: 100 });
  const publishMutation = trpc.marketplace.publish.useMutation({
    onSuccess: () => {
      toast.success("Listing published");
      void listingsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const unpublishMutation = trpc.marketplace.unpublish.useMutation({
    onSuccess: () => {
      toast.success("Listing paused");
      void listingsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const listings = listingsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/dashboard/creator">
              <ArrowLeft className="mr-1 size-4" />
              Creator Hub
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">My Listings</h1>
        </div>
        <Button asChild>
          <Link href="/dashboard/creator/listings/new">
            <Plus className="mr-1 size-4" />
            New listing
          </Link>
        </Button>
      </div>

      {listingsQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {listingsQuery.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {listingsQuery.error.message.includes("FEATURE_DISABLED")
              ? "The marketplace is not yet enabled."
              : listingsQuery.error.message}
          </CardContent>
        </Card>
      )}

      {!listingsQuery.isLoading && !listingsQuery.error && listings.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShoppingBag className="text-muted-foreground size-8" />
            <p className="font-medium">No listings yet.</p>
            <p className="text-muted-foreground text-sm">
              Create your first listing to start earning from your content.
            </p>
            <Button asChild>
              <Link href="/dashboard/creator/listings/new">
                <Plus className="mr-1 size-4" />
                New listing
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {listings.map((listing) => (
          <Card key={listing.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{listing.title}</h2>
                  <Badge
                    variant={listing.isPublished ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {listing.status}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {listing.listingType.replace(/_/g, " ")}
                  </Badge>
                </div>
                {listing.description && (
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    {listing.description}
                  </p>
                )}
                <div className="text-muted-foreground flex items-center gap-3 text-xs">
                  <span className="text-primary font-semibold">{formatInr(listing.priceInr)}</span>
                  <span>{listing.purchaseCount ?? 0} sold</span>
                  <span>
                    {listing.avgRating && listing.avgRating > 0
                      ? `${listing.avgRating.toFixed(1)}★`
                      : "No ratings yet"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {listing.isPublished ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={unpublishMutation.isPending}
                    onClick={() => unpublishMutation.mutate({ listingId: listing.id })}
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={publishMutation.isPending}
                    onClick={() => publishMutation.mutate({ listingId: listing.id })}
                  >
                    Publish
                  </Button>
                )}
                {listing.slug && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/dashboard/marketplace/${listing.slug}`}>View</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
