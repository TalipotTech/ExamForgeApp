"use client";

import Link from "next/link";
import { ArrowRight, Calendar, BookOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

function daysUntil(dateStr: string | Date | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr as string);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function ExamShowcase(): React.ReactElement {
  const featuredQuery = trpc.exam.getFeatured.useQuery({ limit: 3 });
  const upcomingQuery = trpc.exam.getUpcoming.useQuery({ limit: 3 });

  const featured = featuredQuery.data ?? [];
  const upcoming = upcomingQuery.data ?? [];

  if (featuredQuery.isLoading || upcomingQuery.isLoading) {
    return (
      <section className="border-t px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center">
            <Skeleton className="mx-auto h-8 w-64" />
            <Skeleton className="mx-auto mt-3 h-5 w-96" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (featured.length === 0 && upcoming.length === 0) {
    return <></>;
  }

  return (
    <section className="border-t px-4 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Prepare for India&apos;s Top Exams</h2>
          <p className="text-muted-foreground mt-3">
            Thousands of practice questions for competitive exams across pharmacy, medical, civil
            services, and more.
          </p>
        </div>

        {/* Featured Exams */}
        {featured.length > 0 && (
          <div className="mb-12">
            <h3 className="text-muted-foreground mb-4 text-sm font-semibold uppercase tracking-wide">
              Featured Exams
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((exam) => {
                return (
                  <Link key={exam.id} href={`/exams/${exam.id}` as "/"}>
                    <Card className="group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="pt-5">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {exam.category}
                          </Badge>
                          {exam.isFeatured && (
                            <Badge
                              variant="outline"
                              className="border-yellow-500/50 text-xs text-yellow-600"
                            >
                              ★
                            </Badge>
                          )}
                        </div>
                        <h4 className="group-hover:text-primary mb-1 font-bold leading-tight">
                          {exam.name}
                        </h4>
                        <p className="text-muted-foreground mb-3 text-xs">{exam.conductingBody}</p>
                        <div className="text-muted-foreground flex items-center gap-4 text-xs">
                          {exam.examDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {new Date(exam.examDate as unknown as string).toLocaleDateString(
                                "en-IN",
                                {
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <BookOpen className="size-3" />
                            {(exam.questionCount ?? 0).toLocaleString()} Qs
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming Exams */}
        {upcoming.length > 0 && (
          <div className="mb-8">
            <h3 className="text-muted-foreground mb-4 text-sm font-semibold uppercase tracking-wide">
              Upcoming Exams
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((exam) => {
                const days = daysUntil(exam.examDate);
                const regDays = daysUntil(exam.registrationEnd);
                const regClosingSoon = regDays !== null && regDays > 0 && regDays <= 7;

                return (
                  <Link key={exam.id} href={`/exams/${exam.id}` as "/"}>
                    <Card className="group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="pt-5">
                        <h4 className="group-hover:text-primary mb-1 font-bold leading-tight">
                          {exam.name}
                        </h4>
                        <p className="text-muted-foreground mb-3 text-xs">{exam.conductingBody}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {days !== null && days > 0 && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${days <= 30 ? "border-yellow-500/50 text-yellow-600" : "border-green-500/50 text-green-600"}`}
                            >
                              <Clock className="mr-1 size-3" />
                              {days} days left
                            </Badge>
                          )}
                          {regClosingSoon && (
                            <Badge
                              variant="outline"
                              className="border-red-500/50 text-xs text-red-600"
                            >
                              Registration closing soon!
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* View All */}
        <div className="text-center">
          <Link href="/exams">
            <Button variant="outline" className="gap-2">
              View All Exams
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
