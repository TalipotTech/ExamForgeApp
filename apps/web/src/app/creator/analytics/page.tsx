"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Users, Wallet as WalletIcon, Hourglass, Star, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

type TabValue = "overview" | "content" | "classrooms" | "engagement";
type DaysValue = 30 | 90 | 365;

const TABS: { value: TabValue; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "content", label: "Content" },
  { value: "classrooms", label: "Classrooms" },
  { value: "engagement", label: "Engagement" },
];

const DAYS_OPTIONS: { value: DaysValue; label: string }[] = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 365 days" },
];

const STALE_TIME = 60_000;

function paisaToInr(value: number | null | undefined): string {
  if (value == null) return "₹0";
  const rupees = value / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function compactNumber(value: number | null | undefined): string {
  if (value == null) return "0";
  return value.toLocaleString("en-IN");
}

export default function CreatorAnalyticsPage(): React.ReactElement {
  const router = useRouter();
  const search = useSearchParams();

  const tab = (search.get("tab") as TabValue) || "overview";
  const daysParam = Number(search.get("days") ?? 30);
  const days: DaysValue = daysParam === 90 ? 90 : daysParam === 365 ? 365 : 30;

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(search.toString());
    next.set(key, value);
    router.replace(`/creator/analytics?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Read-only summary of your reach, revenue, and engagement.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tab === "overview" && (
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="days-select" className="text-muted-foreground hidden sm:inline">
                Range
              </label>
              <select
                id="days-select"
                value={days}
                onChange={(e) => setParam("days", e.target.value)}
                className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              >
                {DAYS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <OverviewTab days={days} />
        </TabsContent>
        <TabsContent value="content" className="mt-4">
          <ContentTab />
        </TabsContent>
        <TabsContent value="classrooms" className="mt-4">
          <ClassroomsTab />
        </TabsContent>
        <TabsContent value="engagement" className="mt-4">
          <EngagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────

function OverviewTab({ days }: { days: DaysValue }): React.ReactElement {
  const overview = trpc.creatorAnalytics.overview.useQuery(undefined, {
    staleTime: STALE_TIME,
  });
  const revenue = trpc.creatorAnalytics.revenueByDay.useQuery({ days }, { staleTime: STALE_TIME });
  const views = trpc.creatorAnalytics.viewsByDay.useQuery({ days }, { staleTime: STALE_TIME });

  const data = overview.data;

  if (overview.isLoading) {
    return <KpiSkeleton />;
  }

  if (data && data.contentCount === 0 && data.totalViews === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-10 text-center text-sm">
          You haven&apos;t published any content yet. Once views and earnings start coming in, this
          dashboard will fill out.
          <div className="mt-3">
            <Link
              href={"/creator/content" as "/"}
              className="text-primary text-sm font-medium hover:underline"
            >
              Go to your content →
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={<Eye className="h-4 w-4" />}
          label="Total views"
          value={compactNumber(data?.totalViews)}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Students"
          value={compactNumber(data?.totalStudents)}
        />
        <KpiCard
          icon={<WalletIcon className="h-4 w-4" />}
          label="Wallet balance"
          value={paisaToInr(data?.walletBalanceInr)}
          sub={`${paisaToInr(data?.lifetimeEarnedInr)} lifetime`}
        />
        <KpiCard
          icon={<Hourglass className="h-4 w-4" />}
          label="Pending earnings"
          value={paisaToInr(data?.pendingEarningsInr)}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="New followers (30d)"
          value={`+${compactNumber(data?.followerDelta30d)}`}
          sub={`${compactNumber(data?.followerCount)} total`}
        />
        <KpiCard
          icon={<Star className="h-4 w-4" />}
          label="Avg. rating"
          value={(data?.averageRating ?? 0).toFixed(2)}
          sub={`${compactNumber(data?.contentCount)} pieces`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Revenue"
          subtitle={`Last ${days} days`}
          data={(revenue.data ?? []).map((r) => ({
            date: r.date,
            value: r.amount,
          }))}
          isLoading={revenue.isLoading}
          format={(v) => paisaToInr(v)}
          accent="bg-emerald-500"
        />
        <ChartCard
          title="Views"
          subtitle={`Last ${days} days`}
          data={(views.data ?? []).map((r) => ({
            date: r.date,
            value: r.count,
          }))}
          isLoading={views.isLoading}
          format={(v) => compactNumber(v)}
          accent="bg-sky-500"
        />
      </div>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function KpiSkeleton(): React.ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  data,
  isLoading,
  format,
  accent,
}: {
  title: string;
  subtitle: string;
  data: { date: string; value: number }[];
  isLoading: boolean;
  format: (v: number) => string;
  accent: string;
}): React.ReactElement {
  const max = useMemo(() => data.reduce((acc, d) => (d.value > acc ? d.value : acc), 0), [data]);
  const total = useMemo(() => data.reduce((acc, d) => acc + d.value, 0), [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          <span className="text-muted-foreground text-xs font-normal">{subtitle}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{format(total)}</div>
        <div className="text-muted-foreground mb-3 text-xs">total</div>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <div className="text-muted-foreground bg-muted/40 flex h-24 items-center justify-center rounded text-xs">
            No activity in this range
          </div>
        ) : (
          <div className="flex h-24 items-end gap-0.5">
            {data.map((d) => {
              const heightPct = max > 0 ? (d.value / max) * 100 : 0;
              return (
                <div
                  key={d.date}
                  className="group relative flex h-full flex-1 items-end"
                  title={`${d.date}: ${format(d.value)}`}
                >
                  <div
                    className={`${accent} w-full rounded-sm opacity-70 transition-opacity group-hover:opacity-100`}
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Content ──────────────────────────────────────────────

function ContentTab(): React.ReactElement {
  const { data, isLoading } = trpc.creatorAnalytics.topContent.useQuery(
    { limit: 25 },
    { staleTime: STALE_TIME },
  );

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-10 text-center text-sm">
          No content yet. Publish something to start seeing analytics.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 text-right font-medium">Views</th>
                <th className="p-3 text-right font-medium">Watch (min)</th>
                <th className="p-3 text-right font-medium">Likes</th>
                <th className="p-3 text-right font-medium">Doubts</th>
                <th className="p-3 text-right font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40 border-b">
                  <td className="max-w-xs p-3">
                    <div className="truncate font-medium">{row.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.isPublished ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          Draft
                        </Badge>
                      )}
                      {row.isPremium && (
                        <Badge className="ml-1 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-800">
                          Premium
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="text-muted-foreground p-3 capitalize">{row.contentType}</td>
                  <td className="p-3 text-right">{compactNumber(row.viewCount)}</td>
                  <td className="p-3 text-right">{compactNumber(row.totalWatchMinutes)}</td>
                  <td className="p-3 text-right">{compactNumber(row.likeCount)}</td>
                  <td className="p-3 text-right">{compactNumber(row.doubtCount)}</td>
                  <td className="p-3 text-right">{(row.avgRating ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Classrooms ──────────────────────────────────────────────

function ClassroomsTab(): React.ReactElement {
  const { data, isLoading } = trpc.creatorAnalytics.classroomEnrollment.useQuery(undefined, {
    staleTime: STALE_TIME,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-10 text-center text-sm">
          You haven&apos;t created any classrooms yet.
        </CardContent>
      </Card>
    );
  }

  const maxEnrollment = Math.max(...data.map((c) => c.studentCount), 1);

  return (
    <div className="grid gap-3">
      {data.map((row) => {
        const fillPct = (row.studentCount / maxEnrollment) * 100;
        return (
          <Card key={row.classroomId}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/creator/classrooms/${row.classroomId}` as "/"}
                    className="font-semibold hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    {!row.isActive && <Badge variant="secondary">Inactive</Badge>}
                    {row.isPaid && <Badge className="bg-amber-100 text-amber-800">Paid</Badge>}
                    <span>
                      Created{" "}
                      {new Date(row.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold">{compactNumber(row.studentCount)}</div>
                  <div className="text-muted-foreground text-xs">students</div>
                </div>
              </div>

              <div className="bg-muted h-2 w-full overflow-hidden rounded">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${fillPct}%` }}
                />
              </div>

              <div className="text-muted-foreground text-xs">
                {row.joinedLast30 > 0
                  ? `+${row.joinedLast30} joined in the last 30 days`
                  : "No new joins in the last 30 days"}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Engagement ──────────────────────────────────────────────

function EngagementTab(): React.ReactElement {
  const overview = trpc.creatorAnalytics.overview.useQuery(undefined, {
    staleTime: STALE_TIME,
  });
  const stats = trpc.creatorAnalytics.doubtStats.useQuery(undefined, {
    staleTime: STALE_TIME,
  });

  if (overview.isLoading || stats.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const data = stats.data;
  const responseRatePct = ((data?.responseRate ?? 0) * 100).toFixed(1);
  const avgHours = data?.avgResponseHours;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open doubts" icon={null} value={compactNumber(data?.open)} />
        <KpiCard label="Answered" icon={null} value={compactNumber(data?.answered)} />
        <KpiCard
          label="Response rate"
          icon={null}
          value={`${responseRatePct}%`}
          sub={`${compactNumber(data?.total)} total doubts`}
        />
        <KpiCard
          label="Avg. response time"
          icon={null}
          value={avgHours == null ? "—" : `${avgHours.toFixed(1)} hrs`}
          sub="Across all your replies"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Followers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-semibold tracking-tight">
            {compactNumber(overview.data?.followerCount)}
          </div>
          <div className="text-muted-foreground text-xs">
            +{compactNumber(overview.data?.followerDelta30d)} new in the last 30 days
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Doubt status breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <DoubtBreakdownBar
            open={data?.open ?? 0}
            answered={data?.answered ?? 0}
            closed={data?.closed ?? 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DoubtBreakdownBar({
  open,
  answered,
  closed,
}: {
  open: number;
  answered: number;
  closed: number;
}): React.ReactElement {
  const total = open + answered + closed;
  if (total === 0) {
    return <p className="text-muted-foreground text-sm">No doubts received yet.</p>;
  }
  const openPct = (open / total) * 100;
  const answeredPct = (answered / total) * 100;
  const closedPct = (closed / total) * 100;

  return (
    <div className="space-y-2">
      <div className="bg-muted flex h-3 w-full overflow-hidden rounded">
        <div className="bg-orange-400" style={{ width: `${openPct}%` }} />
        <div className="bg-emerald-500" style={{ width: `${answeredPct}%` }} />
        <div className="bg-slate-400" style={{ width: `${closedPct}%` }} />
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-orange-400" />
          Open · {compactNumber(open)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />
          Answered · {compactNumber(answered)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-400" />
          Closed · {compactNumber(closed)}
        </span>
      </div>
    </div>
  );
}
