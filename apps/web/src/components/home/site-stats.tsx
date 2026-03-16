"use client";

import { trpc } from "@/lib/trpc";
import { Users, FileQuestion, BookOpen, Eye } from "lucide-react";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const STAT_ITEMS = [
  { key: "totalUsers", label: "Registered Users", icon: Users, color: "text-blue-500" },
  { key: "totalQuestions", label: "Questions", icon: FileQuestion, color: "text-green-500" },
  { key: "totalTopics", label: "Topics", icon: BookOpen, color: "text-purple-500" },
  { key: "totalVisits", label: "Total Visits", icon: Eye, color: "text-amber-500" },
] as const;

export function SiteStats(): React.ReactElement | null {
  const statsQuery = trpc.publicContent.getSiteStats.useQuery(undefined, {
    staleTime: 10 * 60 * 1000, // 10 min cache
  });

  const stats = statsQuery.data;
  if (!stats) return null;

  // Don't show if all stats are 0
  const hasData = stats.totalUsers > 0 || stats.totalQuestions > 0 || stats.totalTopics > 0;
  if (!hasData) return null;

  return (
    <section className="border-t px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {STAT_ITEMS.map((item) => {
            const value = stats[item.key];
            return (
              <div key={item.key} className="flex flex-col items-center gap-2 text-center">
                <item.icon className={`size-6 ${item.color}`} />
                <span className="text-3xl font-bold tracking-tight">{formatNumber(value)}</span>
                <span className="text-muted-foreground text-sm">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
