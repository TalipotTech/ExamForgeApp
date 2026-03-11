"use client";

import { use } from "react";
import Link from "next/link";
import {
  Calendar,
  BookOpen,
  ExternalLink,
  ArrowLeft,
  Bell,
  GraduationCap,
  Target,
  MinusCircle,
  AlertCircle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

function daysUntil(dateStr: string | Date | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr as string);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: string | Date | null): string {
  if (!d) return "TBA";
  return new Date(d as string).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateWithConfidence(
  d: string | Date | null,
  confidence?: string | null,
): { text: string; badge?: { label: string; className: string } } {
  if (!d) return { text: "TBA" };
  const formatted = formatDate(d);
  switch (confidence) {
    case "confirmed":
      return {
        text: formatted,
        badge: { label: "Confirmed", className: "border-green-500/50 text-green-600" },
      };
    case "approximate":
      return {
        text: `~${formatted}`,
        badge: { label: "Approximate", className: "border-yellow-500/50 text-yellow-600" },
      };
    case "inferred":
      return {
        text: `~${formatted}`,
        badge: { label: "Inferred", className: "border-orange-500/50 text-orange-500" },
      };
    default:
      return { text: formatted };
  }
}

export default function ExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const examQuery = trpc.exam.getById.useQuery({ id: resolvedParams.id });
  const notificationsQuery = trpc.exam.getNotifications.useQuery(
    { examId: resolvedParams.id },
    { enabled: !!resolvedParams.id },
  );

  const exam = examQuery.data;
  const notifications = notificationsQuery.data ?? [];

  if (examQuery.isLoading) {
    return (
      <div className="bg-background min-h-screen">
        <header className="bg-background/95 border-b backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              ExamForge
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </main>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="bg-background min-h-screen">
        <header className="bg-background/95 border-b backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              ExamForge
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <AlertCircle className="text-muted-foreground/50 mx-auto mb-4 size-12" />
          <h1 className="text-xl font-bold">Exam Not Found</h1>
          <Link href="/exams" className="text-primary mt-4 inline-block hover:underline">
            ← Back to Exam Catalog
          </Link>
        </main>
      </div>
    );
  }

  const days = daysUntil(exam.examDate);
  const pattern = exam.examPattern as {
    marks?: number;
    duration?: number;
    negative?: boolean;
  } | null;

  return (
    <div className="bg-background min-h-screen">
      {/* Nav */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/exams" className="text-foreground/80 hover:text-foreground">
              Exams
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Back */}
        <Link
          href="/exams"
          className="text-primary flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to Exam Catalog
        </Link>

        {/* Header */}
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="capitalize">
              {exam.category}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {exam.status ?? "active"}
            </Badge>
            {exam.level && (
              <Badge variant="outline" className="capitalize">
                {exam.level}
              </Badge>
            )}
            {exam.isFeatured && (
              <Badge className="border-yellow-500/50 bg-yellow-500/10 text-yellow-600">
                ★ Featured
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{exam.name}</h1>
          {exam.conductingBody && (
            <p className="text-muted-foreground mt-1">Conducted by {exam.conductingBody}</p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Key Dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="size-4" />
                Key Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {((): React.ReactElement => {
                const dateInfo = formatDateWithConfidence(
                  exam.examDate,
                  (exam as Record<string, unknown>).dateConfidence as string | undefined,
                );
                return (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exam Date</span>
                    <div className="flex items-center gap-2 text-right">
                      <span className="font-medium">{dateInfo.text}</span>
                      {dateInfo.badge && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${dateInfo.badge.className}`}
                        >
                          {dateInfo.badge.label}
                        </Badge>
                      )}
                      {days !== null && days > 0 && (
                        <Badge
                          variant="outline"
                          className={`${days <= 30 ? "border-yellow-500/50 text-yellow-600" : "border-green-500/50 text-green-600"}`}
                        >
                          {days} days left
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })()}
              {exam.registrationStart && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Registration Opens</span>
                  <span className="font-medium">{formatDate(exam.registrationStart)}</span>
                </div>
              )}
              {exam.registrationEnd && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Registration Closes</span>
                  <span className="font-medium">{formatDate(exam.registrationEnd)}</span>
                </div>
              )}
              {exam.resultDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Result Date</span>
                  <span className="font-medium">{formatDate(exam.resultDate)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Exam Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4" />
                Exam Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {exam.totalMarks && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Marks</span>
                  <span className="font-medium">{exam.totalMarks}</span>
                </div>
              )}
              {exam.durationMinutes && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{exam.durationMinutes} minutes</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Negative Marking</span>
                <span className="font-medium">
                  {exam.negativeMarking ? (
                    <span className="flex items-center gap-1 text-red-600">
                      <MinusCircle className="size-3" />
                      Yes
                      {exam.negativeMarkingScheme && ` (${exam.negativeMarkingScheme})`}
                    </span>
                  ) : (
                    "No"
                  )}
                </span>
              </div>
              {pattern?.marks && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pattern</span>
                  <span className="font-medium">
                    {pattern.marks} marks, {pattern.duration}min
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Eligibility */}
        {exam.eligibility && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="size-4" />
                Eligibility
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{exam.eligibility}</p>
            </CardContent>
          </Card>
        )}

        {/* Question Bank */}
        {exam.subjectCounts && exam.subjectCounts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4" />
                Question Bank ({exam.questionCount} questions)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {exam.subjectCounts.map((sc) => (
                  <div
                    key={sc.subject}
                    className="bg-muted/30 flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>{sc.subject}</span>
                    <Badge variant="secondary">{sc.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notifications */}
        {notifications.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4" />
                Recent Updates ({notifications.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.slice(0, 5).map((notif) => (
                <div key={notif.id} className="flex items-start gap-3 text-sm">
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-xs capitalize ${notif.isImportant ? "border-red-500/50 text-red-600" : ""}`}
                  >
                    {notif.type.replace("_", " ")}
                  </Badge>
                  <div>
                    <p className="font-medium">{notif.title}</p>
                    {notif.description && (
                      <p className="text-muted-foreground mt-0.5">{notif.description}</p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatDate(notif.detectedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-3">
          <Link href={`/exams/start?examId=${exam.id}` as "/"}>
            <Button size="lg" className="gap-2">
              <GraduationCap className="size-5" />
              Start Practice
            </Button>
          </Link>
          {exam.syllabusUrl && (
            <a href={exam.syllabusUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="gap-2">
                <FileText className="size-5" />
                View Syllabus
                <ExternalLink className="size-3.5" />
              </Button>
            </a>
          )}
          {exam.applicationUrl && (
            <a href={exam.applicationUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="gap-2">
                Apply Now
                <ExternalLink className="size-3.5" />
              </Button>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
