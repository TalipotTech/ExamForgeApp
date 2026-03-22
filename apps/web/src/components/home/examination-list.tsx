"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Calendar, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export function ExaminationList(): React.ReactElement {
  const [searchValue, setSearchValue] = useState("");
  const router = useRouter();

  const { data, isLoading } = trpc.portalIngestion.listExaminationDocuments.useQuery({
    page: 1,
    limit: 6,
  });

  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    if (!searchValue.trim()) return;
    router.push(`/examinations?search=${encodeURIComponent(searchValue.trim())}` as "/");
  }

  const documents = data?.documents ?? [];

  if (isLoading) {
    return (
      <section className="border-t px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="mx-auto mb-4 h-8 w-72" />
          <Skeleton className="mx-auto mb-8 h-10 w-96" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (documents.length === 0) return <></>;

  return (
    <section className="border-t px-4 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Examination Schedules</h2>
          <p className="text-muted-foreground mt-3">
            Browse the latest examination schedules and download syllabi.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mx-auto mb-10 max-w-lg">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search examinations by name, post, or department..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-11 pl-10 pr-24"
            />
            <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">
              Search
            </Button>
          </div>
        </form>

        {/* Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const meta = doc.metadata as {
              type?: string;
              examinations?: Array<{ examName: string; examDate?: string }>;
            } | null;
            const entryCount = meta?.examinations?.length ?? 0;

            return (
              <Link key={doc.id} href={`/examinations/${doc.id}` as "/"}>
                <Card className="group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="pt-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {doc.portalName}
                      </Badge>
                      {doc.examCategory && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {doc.examCategory}
                        </Badge>
                      )}
                    </div>
                    <h5 className="group-hover:text-primary mb-1 text-sm font-semibold capitalize leading-snug">
                      {(doc.title ?? doc.examName ?? "Examination Schedule").toLowerCase()}
                    </h5>
                    <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" />
                        {entryCount} examinations
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(doc.createdAt as unknown as string).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* View all */}
        {data && data.total > 6 && (
          <div className="mt-8 text-center">
            <Link href={"/examinations" as "/"}>
              <Button variant="outline" className="gap-2">
                View All Examinations
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
