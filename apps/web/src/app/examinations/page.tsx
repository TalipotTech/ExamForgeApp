"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Search, Calendar, FileText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

function ExaminationsContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const limit = 12;

  const { data, isLoading } = trpc.portalIngestion.listExaminationDocuments.useQuery({
    page,
    limit,
  });

  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Client-side filter by search (the listing endpoint returns all docs, search filters cards)
  const filtered = searchValue
    ? documents.filter((doc) => {
        const term = searchValue.toLowerCase();
        return (
          doc.title?.toLowerCase().includes(term) ||
          doc.examName?.toLowerCase().includes(term) ||
          doc.examCategory?.toLowerCase().includes(term) ||
          doc.portalName?.toLowerCase().includes(term)
        );
      })
    : documents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Examination Schedules</h1>
        <p className="text-muted-foreground text-sm">
          Browse examination schedules, download syllabi, and view exam details.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search by exam name, portal, or category..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground py-20 text-center">
          <FileText className="mx-auto mb-3 size-10 opacity-30" />
          <p>No examination schedules found.</p>
          {searchValue && (
            <Button variant="link" className="mt-2" onClick={() => setSearchValue("")}>
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const meta = doc.metadata as {
                type?: string;
                examinations?: Array<{ examName: string; examDate?: string }>;
              } | null;
              const entryCount = meta?.examinations?.length ?? 0;

              return (
                <Link
                  key={doc.id}
                  href={
                    `/examinations/${doc.id}${searchValue ? `?search=${encodeURIComponent(searchValue)}` : ""}` as "/"
                  }
                >
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
                      <h4 className="group-hover:text-primary mb-1 text-sm font-semibold capitalize leading-snug">
                        {(doc.title ?? doc.examName ?? "Examination Schedule").toLowerCase()}
                      </h4>
                      <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <FileText className="size-3" />
                          {entryCount} examinations
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(doc.createdAt as unknown as string).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ExaminationsPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      }
    >
      <ExaminationsContent />
    </Suspense>
  );
}
