"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  FileText,
  Globe,
  BookOpen,
  ClipboardList,
  Trash2,
  ExternalLink,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Saved Type Tabs ───

const SAVED_TABS = [
  { value: "all", label: "All" },
  { value: "bookmark", label: "Bookmarks" },
  { value: "downloaded_pdf", label: "PDFs" },
  { value: "extracted_text", label: "Extracted" },
  { value: "question_set", label: "Questions" },
  { value: "syllabus", label: "Syllabi" },
] as const;

function ContentIcon({ type }: { type: string }): React.ReactElement {
  switch (type) {
    case "pdf":
      return <FileText className="h-5 w-5 text-red-500" />;
    case "syllabus":
      return <BookOpen className="h-5 w-5 text-purple-500" />;
    case "question_set":
      return <ClipboardList className="h-5 w-5 text-green-500" />;
    default:
      return <Globe className="h-5 w-5 text-blue-500" />;
  }
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SavedContentPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const savedQuery = trpc.contentFinder.listSaved.useQuery({
    contentType: activeTab !== "all" ? activeTab : undefined,
    search: searchText || undefined,
    page,
    limit: 20,
  });

  const unsaveMutation = trpc.contentFinder.unsaveResult.useMutation({
    onSuccess: () => {
      toast.success("Content removed from saved items");
      savedQuery.refetch();
    },
    onError: () => {
      toast.error("Failed to remove content");
    },
  });

  const items = savedQuery.data?.items ?? [];
  const total = savedQuery.data?.total ?? 0;
  const totalPages = savedQuery.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Saved Content</h1>
          <p className="text-muted-foreground text-sm">
            {total} saved item{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Button asChild>
          <Link href={"/dashboard/find" as "/"}>
            <Search className="mr-2 h-4 w-4" />
            Find More
          </Link>
        </Button>
      </div>

      {/* ─── Filter Tabs ─── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v);
          setPage(1);
        }}
      >
        <TabsList>
          {SAVED_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ─── Search ─── */}
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search saved content..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* ─── Loading ─── */}
      {savedQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 py-4">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Items ─── */}
      {!savedQuery.isLoading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-4 py-4">
                <ContentIcon type={item.contentType} />

                <div className="min-w-0 flex-1">
                  <h3 className="font-medium leading-tight">{item.title}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    {item.sourceName && (
                      <span className="text-muted-foreground text-xs">{item.sourceName}</span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {item.savedType.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags?.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {item.questionsExtracted && item.questionsExtracted > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {item.questionsExtracted} Qs extracted
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-1">
                  {item.sourceUrl && !item.sourceUrl.startsWith("internal://") && (
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open source"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => unsaveMutation.mutate({ savedContentId: item.id })}
                    disabled={unsaveMutation.isPending}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
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
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Empty State ─── */}
      {!savedQuery.isLoading && items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Bookmark className="text-muted-foreground mx-auto mb-3 h-12 w-12" />
            <h3 className="text-lg font-medium">No saved content yet</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Search for exam resources and save them to your library
            </p>
            <Button asChild className="mt-4">
              <Link href={"/dashboard/find" as "/"}>
                <Search className="mr-2 h-4 w-4" />
                Find Content
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
