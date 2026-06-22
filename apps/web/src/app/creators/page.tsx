"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Star,
  Users,
  ShieldCheck,
  Award,
  ChevronLeft,
  ChevronRight,
  Compass,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 12;
const STALE_TIME = 5 * 60 * 1000;

type SortValue = "featured" | "rating" | "newest";

export default function CreatorsDirectoryPage(): React.ReactElement {
  const router = useRouter();
  const search = useSearchParams();

  const page = Math.max(1, Number(search.get("page") ?? 1));
  const examFilter = search.get("exam") ?? "";
  const sort = (search.get("sort") as SortValue) || "featured";
  const verifiedOnly = search.get("verified") === "1";
  const query = search.get("q") ?? "";

  function setParam(updates: Record<string, string | null>): void {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Filter changes always reset to page 1.
    if (!Object.prototype.hasOwnProperty.call(updates, "page")) {
      next.delete("page");
    }
    router.replace(`/creators?${next.toString()}`, { scroll: false });
  }

  const directory = trpc.creator.listPublic.useQuery(
    {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      examId: examFilter || undefined,
      search: query || undefined,
      sort,
      verifiedOnly,
    },
    { staleTime: STALE_TIME, placeholderData: (prev) => prev },
  );

  const examsQuery = trpc.exam.listPublic.useQuery(
    { page: 1, limit: 100, sort: "popularity" },
    { staleTime: STALE_TIME },
  );

  const totalPages = directory.data ? Math.max(1, Math.ceil(directory.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="bg-background min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-3 gap-1.5">
            <Compass className="h-3.5 w-3.5" />
            Creators
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Learn from India&apos;s best exam-prep creators
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Verified educators teaching BPharm, GPAT, NEET, UPSC, GATE, and more. Follow them, take
            their classrooms, and start practicing for free.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <aside className="space-y-5">
            <FilterBlock title="Search">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
                <Input
                  placeholder="Name, institution..."
                  defaultValue={query}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setParam({ q: (e.target as HTMLInputElement).value });
                    }
                  }}
                  className="pl-8"
                />
              </div>
            </FilterBlock>

            <FilterBlock title="Exam">
              <select
                value={examFilter}
                onChange={(e) => setParam({ exam: e.target.value || null })}
                className="border-input bg-background w-full rounded-md border px-2.5 py-2 text-sm"
              >
                <option value="">All exams</option>
                {(examsQuery.data?.exams ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </FilterBlock>

            <FilterBlock title="Sort by">
              <select
                value={sort}
                onChange={(e) => setParam({ sort: e.target.value })}
                className="border-input bg-background w-full rounded-md border px-2.5 py-2 text-sm"
              >
                <option value="featured">Featured</option>
                <option value="rating">Top rated</option>
                <option value="newest">Newest</option>
              </select>
            </FilterBlock>

            <FilterBlock title="Verification">
              <label className="text-foreground/80 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setParam({ verified: e.target.checked ? "1" : null })}
                  className="size-4"
                />
                Verified only
              </label>
            </FilterBlock>
          </aside>

          <section>
            {directory.isLoading && !directory.data ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full" />
                ))}
              </div>
            ) : !directory.data || directory.data.items.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground p-12 text-center text-sm">
                  No creators match your filters yet.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="text-muted-foreground mb-3 text-xs">
                  Showing {directory.data.offset + 1}–
                  {Math.min(
                    directory.data.offset + directory.data.items.length,
                    directory.data.total,
                  )}{" "}
                  of {directory.data.total}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {directory.data.items.map((creator) => (
                    <CreatorCard key={creator.id} creator={creator} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setParam({ page: String(page - 1) })}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-muted-foreground text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setParam({ page: String(page + 1) })}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function FilterBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="text-foreground/80 text-xs font-medium uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

type CreatorRow = {
  id: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  institution: string | null;
  institutionType: string | null;
  bio: string | null;
  specializations: string[] | null;
  examsCovered: string[] | null;
  verificationStatus: string;
  isFeatured: boolean | null;
  followerCount: number | null;
  contentCount: number | null;
  averageRating: number | null;
  totalRatings: number | null;
};

function CreatorCard({ creator }: { creator: CreatorRow }): React.ReactElement {
  const initials = useMemo(
    () =>
      creator.displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "C",
    [creator.displayName],
  );
  const href = creator.slug ? (`/creators/${creator.slug}` as "/") : ("/creators" as "/");

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <Link href={href} className="block">
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
      </Link>

      <CardContent className="p-4">
        <div className="-mt-10 mb-3 flex items-end gap-3">
          <Avatar src={creator.avatarUrl} initials={initials} />
          <div className="min-w-0 flex-1 pb-1">
            <Link
              href={href}
              className="block truncate font-semibold hover:underline"
              title={creator.displayName}
            >
              {creator.displayName}
            </Link>
            <div className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
              {creator.verificationStatus === "verified" ||
              creator.verificationStatus === "featured" ? (
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
              ) : null}
              <span className="truncate">{creator.institution ?? "Independent"}</span>
            </div>
          </div>
        </div>

        {creator.bio && <p className="text-muted-foreground line-clamp-2 text-sm">{creator.bio}</p>}

        <div className="text-muted-foreground mt-3 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {(creator.averageRating ?? 0).toFixed(1)}
            {creator.totalRatings ? ` (${creator.totalRatings})` : ""}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {(creator.followerCount ?? 0).toLocaleString("en-IN")}
          </span>
          <span className="ml-auto">
            {(creator.contentCount ?? 0).toLocaleString("en-IN")} pieces
          </span>
        </div>

        <Link href={href} className="mt-4 block">
          <Button variant="outline" className="w-full" size="sm">
            View profile
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function Avatar({ src, initials }: { src: string | null; initials: string }): React.ReactElement {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="bg-background size-16 shrink-0 rounded-full border-4 object-cover shadow-sm"
        loading="lazy"
      />
    );
  }
  return (
    <div className="bg-accent text-accent-foreground border-background flex size-16 shrink-0 items-center justify-center rounded-full border-4 text-lg font-semibold shadow-sm">
      {initials}
    </div>
  );
}

function Header(): React.ReactElement {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ExamForge
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href={"/exams" as "/"}
            className="text-foreground/80 hover:text-foreground text-sm transition-colors"
          >
            Exams
          </Link>
          <Link
            href={"/creators" as "/"}
            className="text-foreground/80 hover:text-foreground text-sm transition-colors"
          >
            Creators
          </Link>
          <Link href={"/login" as "/"}>
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function PublicFooter(): React.ReactElement {
  return (
    <footer className="border-t px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-muted-foreground text-sm">
          ExamForge &mdash; AI exam preparation platform
        </p>
        <p className="text-muted-foreground text-xs">Built for Indian competitive exams</p>
      </div>
    </footer>
  );
}
