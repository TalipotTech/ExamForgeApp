"use client";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";

export function PopularTags(): React.ReactElement | null {
  const keywordsQuery = trpc.publicContent.getPopularKeywords.useQuery(
    { limit: 30 },
    { staleTime: 30 * 60 * 1000 },
  );

  const keywords = keywordsQuery.data ?? [];

  if (keywords.length === 0) return null;

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <Tag className="text-primary h-5 w-5" />
          <h2 className="text-xl font-bold">Trending Topics</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <Badge
              key={kw.keyword}
              variant="secondary"
              className="cursor-default px-3 py-1.5 text-sm"
            >
              {kw.keyword}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
