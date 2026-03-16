"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, BookOpen, ArrowRight, ChevronRight, StickyNote } from "lucide-react";

export default function PublicExamTopicsPage(): React.ReactElement {
  const params = useParams();
  const examSlug = params.examSlug as string;

  const topicsQuery = trpc.publicContent.getPublicExamTopics.useQuery(
    { examSlug },
    { staleTime: 5 * 60 * 1000 },
  );

  if (topicsQuery.isLoading) {
    return (
      <div className="bg-background min-h-screen">
        <Header />
        <div className="mx-auto max-w-4xl px-4 py-12">
          <Skeleton className="mb-4 h-10 w-64" />
          <Skeleton className="mb-8 h-6 w-96" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="mb-3 h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const data = topicsQuery.data;

  if (!data?.exam) {
    return (
      <div className="bg-background min-h-screen">
        <Header />
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Exam not found</h1>
            <p className="text-muted-foreground mt-2">
              The exam you&apos;re looking for doesn&apos;t exist.
            </p>
            <Link href="/">
              <Button className="mt-4">Go Home</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get detail topics (depth 2+) for display
  const detailTopics = data.topics.filter((t) => t.depth >= 2);

  return (
    <div className="bg-background min-h-screen">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-12">
        {/* Hero */}
        <div className="mb-10">
          <Badge variant="secondary" className="mb-3 gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            Exam Preparation
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{data.exam.name}</h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Explore {detailTopics.length}+ topics with AI-generated tutorials, practice exams, and
            community notes.
          </p>
        </div>

        {/* CTA */}
        <Card className="border-primary/20 bg-primary/5 mb-8">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold">Start learning for free</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Sign up to access full tutorials, practice exams, and AI-powered study tools.
              </p>
            </div>
            <Link href="/login">
              <Button className="gap-2">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Topics list */}
        <div className="space-y-3">
          {detailTopics.map((topic) => (
            <Link key={topic.id} href={`/topics/${examSlug}/${topic.slug}` as "/"}>
              <Card className="hover:bg-muted/50 transition-colors">
                <CardContent className="flex items-center gap-4 p-4">
                  <BookOpen className="text-muted-foreground h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{topic.title}</h3>
                    {topic.summaryPreview && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {topic.summaryPreview}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {topic.noteCount > 0 && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <StickyNote className="h-3 w-3" />
                        {topic.noteCount}
                      </Badge>
                    )}
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {detailTopics.length === 0 && (
          <Card>
            <CardContent className="text-muted-foreground py-12 text-center">
              <BookOpen className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="text-lg font-medium">Topics coming soon</p>
              <p className="mt-1 text-sm">
                We&apos;re preparing comprehensive study material for this exam.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <h3 className="text-xl font-semibold">Ready to ace {data.exam.name}?</h3>
          <p className="text-muted-foreground mt-2">
            Create a free account to access full tutorials and practice exams.
          </p>
          <Link href="/login">
            <Button size="lg" className="mt-4 gap-2">
              <GraduationCap className="h-5 w-5" />
              Start Practicing Free
            </Button>
          </Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function Header(): React.ReactElement {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ExamForge
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/exams"
            className="text-foreground/80 hover:text-foreground text-sm transition-colors"
          >
            Exams
          </Link>
          <Link href="/login">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function PublicFooter(): React.ReactElement {
  return (
    <footer className="border-t px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-muted-foreground text-sm">
          ExamForge &mdash; AI exam preparation platform
        </p>
        <p className="text-muted-foreground text-xs">Built for Indian competitive exams</p>
      </div>
    </footer>
  );
}
