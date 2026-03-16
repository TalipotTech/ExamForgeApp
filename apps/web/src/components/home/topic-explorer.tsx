"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, ArrowRight } from "lucide-react";

export function TopicExplorer(): React.ReactElement | null {
  const examsQuery = trpc.publicContent.listPublicExams.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const examsList = examsQuery.data ?? [];

  if (examsList.length === 0) return null;

  return (
    <section className="border-t px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Explore Study Topics</h2>
          <p className="text-muted-foreground mt-3">
            Browse comprehensive study material for your exam, powered by AI and community notes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {examsList.map((exam) => (
            <Link key={exam.id} href={`/topics/${exam.slug}` as "/"}>
              <Card className="hover:bg-muted/50 h-full transition-colors">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <BookOpen className="text-primary size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{exam.name}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {exam.topicCount} topics with tutorials
                    </p>
                  </div>
                  <ArrowRight className="text-muted-foreground mt-1 h-4 w-4 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
