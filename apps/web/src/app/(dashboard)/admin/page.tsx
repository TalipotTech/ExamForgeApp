"use client";

import Link from "next/link";
import {
  Users,
  Settings,
  BookOpen,
  FileText,
  GraduationCap,
  Bot,
  Compass,
  FileInput,
  Sparkles,
  Search,
  Bookmark,
  Activity,
  BookMarked,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_LINKS: QuickLink[] = [
  {
    href: "/questions",
    label: "Question Bank",
    description: "Browse & manage questions",
    icon: BookOpen,
  },
  {
    href: "/admin/question-generation/generate",
    label: "Generate (ad-hoc)",
    description: "AI question generation — legacy ad-hoc UI, now under Question Gen",
    icon: Sparkles,
  },
  { href: "/scraper", label: "Scraper", description: "Manage scrape sources", icon: Bot },
  {
    href: "/scraper/discovery",
    label: "Discovery",
    description: "Exam discovery agent",
    icon: Compass,
  },
  {
    href: "/scraper/ingest",
    label: "Ingest",
    description: "Portal document ingestion",
    icon: FileInput,
  },
  {
    href: "/syllabus",
    label: "Syllabus",
    description: "Manage syllabi & tutorials",
    icon: GraduationCap,
  },
  {
    href: "/admin/tutorials",
    label: "Tutorials",
    description: "AI tutorial generation",
    icon: BookMarked,
  },
  {
    href: "/dashboard/find",
    label: "Find Content",
    description: "Smart content search",
    icon: Search,
  },
  { href: "/dashboard/saved", label: "Saved", description: "Bookmarked content", icon: Bookmark },
  {
    href: "/exams/start",
    label: "Start Exam",
    description: "Take a practice exam",
    icon: FileText,
  },
];

export default function AdminOverviewPage(): React.ReactElement {
  const { data: usersData } = trpc.adminUsers.list.useQuery({ page: 1, limit: 1 });
  const { data: ingestStats } = trpc.portalIngestion.getStats.useQuery();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Platform overview and quick access to all admin tools.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{usersData?.total ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Questions</CardTitle>
            <BookOpen className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ingestStats?.approvedQuestions ?? "—"}</p>
            <p className="text-muted-foreground text-xs">
              {ingestStats?.pendingReview ? `${ingestStats.pendingReview} pending review` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ingestStats?.totalDocuments ?? "—"}</p>
            <p className="text-muted-foreground text-xs">
              {ingestStats?.processedDocuments ? `${ingestStats.processedDocuments} processed` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <Activity className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-2xl font-bold">
              {ingestStats?.errorDocuments ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Management section */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={"/admin/users" as "/"}>
          <Card className="hover:bg-accent/50 h-full transition-colors">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Users className="text-muted-foreground size-5" />
              <div>
                <CardTitle className="text-base">User Management</CardTitle>
                <CardDescription>Accounts, roles, subscriptions, and credits</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href={"/admin/settings" as "/"}>
          <Card className="hover:bg-accent/50 h-full transition-colors">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Settings className="text-muted-foreground size-5" />
              <div>
                <CardTitle className="text-base">Platform Settings</CardTitle>
                <CardDescription>Feature flags, auth, SMS, and payment config</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Quick links grid */}
      <div>
        <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wider">
          Quick Access
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href as "/"}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="text-primary size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{link.label}</p>
                      <p className="text-muted-foreground text-xs">{link.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
