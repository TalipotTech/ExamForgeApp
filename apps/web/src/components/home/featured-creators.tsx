"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, ArrowRight, Search, ShieldCheck, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const STALE_TIME = 5 * 60 * 1000;

export function FeaturedCreators(): React.ReactElement | null {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const { data, isLoading } = trpc.creator.listPublic.useQuery(
    { limit: 6, offset: 0, sort: "featured" },
    { staleTime: STALE_TIME },
  );

  function handleSearch(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = query.trim();
    const target = trimmed ? `/creators?q=${encodeURIComponent(trimmed)}` : "/creators";
    router.push(target as "/");
  }

  // Auto-hide while we have nothing to show — no skeleton flash on cold pages.
  if (!isLoading && (!data || data.items.length === 0)) {
    return null;
  }

  const creators = data?.items ?? [];

  return (
    <section className="border-t px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Badge variant="secondary" className="mb-3 gap-1.5">
              <Award className="size-3.5" />
              Featured creators
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight">Learn from verified educators</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Toppers, faculty, and institutes publishing exam-prep content across BPharm, GPAT,
              NEET, UPSC, GATE and more.
            </p>
          </div>

          <form onSubmit={handleSearch} className="w-full md:w-auto">
            <div className="flex gap-2">
              <div className="relative flex-1 md:w-72">
                <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search creators by name or institution..."
                  className="pl-8"
                  aria-label="Search creators"
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </div>
          </form>
        </div>

        {isLoading ? (
          <CreatorGridSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((creator) => (
              <CreatorTile key={creator.id} creator={creator} />
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href={"/creators" as "/"}>
            <Button variant="outline" className="gap-2">
              Browse all creators
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

type CreatorRow = {
  id: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  institution: string | null;
  verificationStatus: string;
  isFeatured: boolean | null;
  followerCount: number | null;
  averageRating: number | null;
  totalRatings: number | null;
  contentCount: number | null;
};

function CreatorTile({ creator }: { creator: CreatorRow }): React.ReactElement {
  const initials =
    creator.displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "C";
  const verified =
    creator.verificationStatus === "verified" || creator.verificationStatus === "featured";
  const href = creator.slug ? (`/creators/${creator.slug}` as "/") : ("/creators" as "/");

  return (
    <Link href={href} className="block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="bg-muted relative aspect-[3/1] w-full">
          {creator.coverImageUrl ? (
            <img
              src={creator.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="from-muted to-accent/20 h-full w-full bg-gradient-to-br" />
          )}
          {creator.isFeatured && (
            <Badge className="absolute right-2 top-2 gap-1 bg-amber-100 text-amber-800">
              <Award className="h-3 w-3" />
              Featured
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <div className="-mt-9 mb-2 flex items-end gap-3">
            {creator.avatarUrl ? (
              <img
                src={creator.avatarUrl}
                alt=""
                className="bg-background size-14 shrink-0 rounded-full border-4 object-cover shadow-sm"
                loading="lazy"
              />
            ) : (
              <div className="bg-accent text-accent-foreground border-background flex size-14 shrink-0 items-center justify-center rounded-full border-4 text-base font-semibold shadow-sm">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1 pb-1">
              <div className="truncate font-semibold">{creator.displayName}</div>
              <div className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                {verified && <ShieldCheck className="h-3 w-3 text-emerald-600" />}
                <span className="truncate">{creator.institution ?? "Independent"}</span>
              </div>
            </div>
          </div>

          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {(creator.averageRating ?? 0).toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {(creator.followerCount ?? 0).toLocaleString("en-IN")}
            </span>
            <span className="ml-auto">
              {(creator.contentCount ?? 0).toLocaleString("en-IN")} pieces
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CreatorGridSkeleton(): React.ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="bg-muted aspect-[3/1] w-full animate-pulse" />
          <CardContent className="p-4">
            <div className="bg-muted -mt-9 mb-3 size-14 animate-pulse rounded-full" />
            <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
            <div className="bg-muted mt-2 h-3 w-1/2 animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
