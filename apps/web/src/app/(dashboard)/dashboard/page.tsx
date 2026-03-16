"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  BookOpen,
  Play,
  ArrowRight,
  Clock,
  Target,
  Loader2,
  Library,
  FileQuestion,
  StickyNote,
  Hash,
  Monitor,
  MapPin,
  LogIn,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getDeviceInfo(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Mac/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown Device";
}

function getBrowserInfo(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

export default function DashboardPage(): React.ReactElement {
  const { data: session } = useSession();
  const dashboardQuery = trpc.learn.getDashboardData.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });
  const quotaQuery = trpc.tutorialAgent.getExamQuota.useQuery(undefined, {
    staleTime: 60_000,
  });

  const data = dashboardQuery.data;
  const quota = quotaQuery.data;
  const userName = session?.user?.name?.split(" ")[0] ?? "there";

  // Client-side device info
  const [deviceInfo, setDeviceInfo] = useState("");
  const [browserInfo, setBrowserInfo] = useState("");
  useEffect(() => {
    setDeviceInfo(getDeviceInfo());
    setBrowserInfo(getBrowserInfo());
  }, []);

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {userName}!</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your learning progress.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/learn">
          <Card className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <Library className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium">Browse Tutorials</p>
                <p className="text-muted-foreground text-xs">Learn from AI content</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/exams/start">
          <Card className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                <Play className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium">Practice Exam</p>
                <p className="text-muted-foreground text-xs">Test your knowledge</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/my-exams">
          <Card className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <FileQuestion className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">My Exams</p>
                  {quota && (
                    <Badge
                      variant={quota.used >= quota.limit ? "destructive" : "secondary"}
                      className={cn(
                        "gap-0.5 px-1.5 py-0 text-[10px]",
                        quota.used >= quota.limit - 2 &&
                          quota.used < quota.limit &&
                          "border-amber-500 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      <Zap className="size-2.5" />
                      {quota.used}/{quota.limit}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">History & scores</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/topics">
          <Card className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/30">
                <Hash className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex items-center gap-2">
                <p className="font-medium">My Topics</p>
                {data && data.totalTopics > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {data.totalTopics}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/notes">
          <Card className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <StickyNote className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex items-center gap-2">
                <p className="font-medium">My Notes</p>
                {data && data.totalNotes > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {data.totalNotes}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* User Activity Card */}
      {data?.userActivity && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LogIn className="h-4 w-4" />
              Your Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <LogIn className="text-muted-foreground h-5 w-5 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{data.userActivity.loginCount}</p>
                  <p className="text-muted-foreground text-xs">Total Visits</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Clock className="text-muted-foreground h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {data.userActivity.lastLoginAt
                      ? new Date(data.userActivity.lastLoginAt).toLocaleString()
                      : "N/A"}
                  </p>
                  <p className="text-muted-foreground text-xs">Last Login</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Monitor className="text-muted-foreground h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {deviceInfo} / {browserInfo}
                  </p>
                  <p className="text-muted-foreground text-xs">Current Device</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <MapPin className="text-muted-foreground h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{data.userActivity.lastLoginIp ?? "N/A"}</p>
                  <p className="text-muted-foreground text-xs">Last IP Address</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Your Exams */}
      {data && data.selectedExams.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" />
              Your Exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.selectedExams.map((exam) => (
                <div key={exam.examId} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{exam.examName}</h3>
                    <Badge variant="outline" className="text-xs">
                      {exam.examCategory}
                    </Badge>
                  </div>
                  {exam.targetScore && (
                    <div className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
                      <Target className="h-3 w-3" />
                      Target: {exam.targetScore}%
                    </div>
                  )}
                  {exam.syllabi.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {exam.syllabi.map((syl) => (
                        <Link key={syl.syllabusId} href={`/learn/${syl.syllabusId}`}>
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                            <BookOpen className="h-3 w-3" />
                            {syl.syllabusName}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Three Column: My Topics + Continue Learning + Recent Exams */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* My Topics */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4" />
                My Topics
              </CardTitle>
              {data && data.totalTopics > 0 && (
                <Link href="/dashboard/topics">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                    View All
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!data || data.recentTopics.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No topics studied yet. Browse tutorials to start learning.
              </p>
            ) : (
              <div className="space-y-3">
                {data.recentTopics.map((topic) => (
                  <Link key={topic.nodeId} href={`/learn/${topic.syllabusId}`}>
                    <div className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
                      <div className="flex items-center justify-between">
                        <h4 className="truncate text-sm font-medium">{topic.nodeTitle}</h4>
                        <Badge
                          variant={topic.completionPercent >= 100 ? "default" : "secondary"}
                          className="shrink-0 text-xs"
                        >
                          {topic.completionPercent}%
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                        <span className="truncate">{topic.syllabusName}</span>
                        <span>•</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(topic.lastReadAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="bg-muted mt-2 h-1.5 w-full rounded-full">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-all"
                          style={{ width: `${Math.min(topic.completionPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Continue Learning */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              Continue Learning
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data || data.recentProgress.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No tutorials started yet. Browse tutorials to begin learning.
              </p>
            ) : (
              <div className="space-y-3">
                {data.recentProgress.map((progress) => (
                  <Link
                    key={`${progress.syllabusId}-${progress.syllabusNodeId}`}
                    href={`/learn/${progress.syllabusId}`}
                  >
                    <div className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
                      <div className="flex items-center justify-between">
                        <h4 className="truncate text-sm font-medium">{progress.nodeTitle}</h4>
                        <Badge
                          variant={progress.completionPercent >= 100 ? "default" : "secondary"}
                          className="shrink-0 text-xs"
                        >
                          {progress.completionPercent}%
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                        <span className="truncate">{progress.syllabusName}</span>
                        <span>•</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(progress.lastReadAt).toLocaleDateString()}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="bg-muted mt-2 h-1.5 w-full rounded-full">
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${Math.min(progress.completionPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Exam Results */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileQuestion className="h-4 w-4" />
              Recent Exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data || data.recentExams.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No practice exams taken yet. Generate an exam to test your knowledge.
              </p>
            ) : (
              <div className="space-y-3">
                {data.recentExams.map((exam) => (
                  <div key={exam.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="truncate text-sm font-medium">{exam.title}</h4>
                      {exam.bestScore !== null && (
                        <Badge
                          variant={exam.bestScore >= 70 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          <Target className="mr-1 h-2.5 w-2.5" />
                          {Math.round(exam.bestScore)}%
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                      <span>{exam.questionCount} questions</span>
                      <span>
                        {exam.timesAttempted} attempt{exam.timesAttempted !== 1 ? "s" : ""}
                      </span>
                      <span>{new Date(exam.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
