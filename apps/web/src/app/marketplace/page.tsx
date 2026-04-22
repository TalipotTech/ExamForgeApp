"use client";

import Link from "next/link";
import { useState } from "react";
import { Store, Search, Star, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

type SortKey = "newest" | "price_asc" | "price_desc" | "popular" | "rating";
type ListingTypeKey =
  | "all"
  | "question_set"
  | "tutorial"
  | "video"
  | "audio"
  | "course"
  | "document"
  | "bundle";

const LISTING_TYPES: { value: ListingTypeKey; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "question_set", label: "Question sets" },
  { value: "tutorial", label: "Tutorials" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "course", label: "Courses" },
  { value: "document", label: "Documents" },
  { value: "bundle", label: "Bundles" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function formatInr(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function MarketplacePage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [listingType, setListingType] = useState<ListingTypeKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const browseQuery = trpc.marketplace.browse.useQuery(
    {
      search: search || undefined,
      listingType: listingType === "all" ? undefined : listingType,
      sort,
      limit: 30,
      offset: 0,
    },
    { staleTime: 30_000 },
  );

  const listings = browseQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Store className="size-6" />
            Marketplace
          </h1>
          <p className="text-muted-foreground text-sm">
            Discover question sets, tutorials, and courses from our creator community.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search listings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={listingType} onValueChange={(v) => setListingType(v as ListingTypeKey)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LISTING_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {browseQuery.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      )}

      {browseQuery.error && (
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {browseQuery.error.message.includes("FEATURE_DISABLED") ? (
              <>The marketplace is not yet enabled. Check back soon.</>
            ) : (
              <>Could not load listings: {browseQuery.error.message}</>
            )}
          </CardContent>
        </Card>
      )}

      {!browseQuery.isLoading && !browseQuery.error && listings.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ShoppingBag className="text-muted-foreground size-8" />
            <p className="font-medium">No listings match your search.</p>
            <p className="text-muted-foreground text-sm">
              Try clearing filters or come back later — creators publish new content regularly.
            </p>
          </CardContent>
        </Card>
      )}

      {listings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/marketplace/${listing.slug ?? listing.id}`}
              className="block"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                {listing.coverImageUrl && (
                  <div
                    className="bg-muted aspect-video w-full rounded-t-md bg-cover bg-center"
                    style={{ backgroundImage: `url('${listing.coverImageUrl}')` }}
                  />
                )}
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-sm font-semibold">{listing.title}</h2>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {listing.listingType.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {listing.description && (
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {listing.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-primary text-base font-bold">
                      {formatInr(listing.priceInr)}
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Star className="size-3 fill-current text-amber-500" />
                      {listing.avgRating && listing.avgRating > 0
                        ? listing.avgRating.toFixed(1)
                        : "—"}
                      <span className="mx-1">·</span>
                      <span>{listing.purchaseCount ?? 0} sold</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/creator">Become a creator</Link>
        </Button>
      </div>
    </div>
  );
}
