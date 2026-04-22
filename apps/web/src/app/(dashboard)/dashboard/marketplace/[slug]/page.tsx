"use client";

import Link from "next/link";
import { use } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, Star, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { MarketplaceCheckoutButton } from "@/components/razorpay-checkout";

export default function MarketplaceListingPage(props: {
  params: Promise<{ slug: string }>;
}): React.ReactElement {
  const { slug } = use(props.params);
  const { data: session } = useSession();

  const listingQuery = trpc.marketplace.getBySlug.useQuery({ slug }, { staleTime: 30_000 });
  const listing = listingQuery.data ?? null;

  const myRatingQuery = trpc.contentRating.myRatingForListing.useQuery(
    listing ? { listingId: listing.id } : { listingId: "" },
    { enabled: !!listing },
  );
  const ratingsQuery = trpc.contentRating.listByListing.useQuery(
    listing
      ? { listingId: listing.id, limit: 10, offset: 0 }
      : { listingId: "", limit: 10, offset: 0 },
    { enabled: !!listing },
  );

  if (listingQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (listingQuery.error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {listingQuery.error.message.includes("FEATURE_DISABLED")
              ? "The marketplace is not yet enabled."
              : listingQuery.error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            Listing not found.{" "}
            <Link className="underline" href="/dashboard/marketplace">
              Back to marketplace
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ratings = ratingsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/marketplace">
          <ArrowLeft className="mr-1 size-4" />
          Back to marketplace
        </Link>
      </Button>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {listing.coverImageUrl && (
            <div
              className="bg-muted aspect-video w-full rounded-md bg-cover bg-center"
              style={{ backgroundImage: `url('${listing.coverImageUrl}')` }}
            />
          )}
          <div className="flex items-start gap-3">
            <Badge variant="outline">{listing.listingType.replace(/_/g, " ")}</Badge>
            {listing.subject && <Badge variant="secondary">{listing.subject}</Badge>}
          </div>
          <h1 className="text-3xl font-bold">{listing.title}</h1>
          {listing.description && (
            <p className="text-muted-foreground leading-relaxed">{listing.description}</p>
          )}
          {listing.previewContent && (
            <Card>
              <CardContent className="space-y-1 p-4">
                <h2 className="font-semibold">Preview</h2>
                <p className="text-muted-foreground whitespace-pre-wrap text-sm">
                  {listing.previewContent}
                </p>
              </CardContent>
            </Card>
          )}

          <Separator />

          <div>
            <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
            {ratings.length === 0 && (
              <p className="text-muted-foreground text-sm">No reviews yet.</p>
            )}
            <div className="space-y-3">
              {ratings.map((r) => (
                <Card key={r.id}>
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-amber-500">
                        {Array.from({ length: r.rating }).map((_, i) => (
                          <Star key={i} className="size-3 fill-current" />
                        ))}
                      </div>
                      {r.reviewTitle && (
                        <span className="text-sm font-medium">{r.reviewTitle}</span>
                      )}
                    </div>
                    {r.reviewText && (
                      <p className="text-muted-foreground text-sm">{r.reviewText}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-4 p-5">
            <div className="text-3xl font-bold">
              ₹{(listing.priceInr / 100).toLocaleString("en-IN")}
            </div>
            <div className="text-muted-foreground flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <Star className="size-3 fill-current text-amber-500" />
                {listing.avgRating && listing.avgRating > 0 ? listing.avgRating.toFixed(1) : "—"}
              </span>
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {listing.purchaseCount ?? 0} sold
              </span>
            </div>
            <MarketplaceCheckoutButton
              listingId={listing.id}
              listingTitle={listing.title}
              priceInr={listing.priceInr}
              buyerName={session?.user?.name ?? undefined}
              buyerEmail={session?.user?.email ?? undefined}
              onSuccess={() => {
                void listingQuery.refetch();
                void myRatingQuery.refetch();
              }}
            />
            {myRatingQuery.data && (
              <p className="text-muted-foreground text-xs">
                You rated this {myRatingQuery.data.rating} / 5.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
