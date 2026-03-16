"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, ArrowRight, ArrowLeft, BookOpen, StickyNote, Lock } from "lucide-react";

export default function PublicTopicPage(): React.ReactElement {
  const params = useParams();
  const examSlug = params.examSlug as string;
  const topicSlug = params.topicSlug as string;

  const topicQuery = trpc.publicContent.getPublicTopicSummary.useQuery(
    { examSlug, topicSlug },
    { staleTime: 5 * 60 * 1000 },
  );

  if (topicQuery.isLoading) {
    return (
      <div className="bg-background min-h-screen">
        <Header examSlug={examSlug} />
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Skeleton className="mb-2 h-6 w-32" />
          <Skeleton className="mb-4 h-10 w-full" />
          <Skeleton className="mb-8 h-4 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const data = topicQuery.data;

  if (!data) {
    return (
      <div className="bg-background min-h-screen">
        <Header examSlug={examSlug} />
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Topic not found</h1>
            <p className="text-muted-foreground mt-2">
              The topic you&apos;re looking for doesn&apos;t exist.
            </p>
            <Link href={`/topics/${examSlug}` as "/"}>
              <Button className="mt-4">Browse Topics</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <Header examSlug={examSlug} />

      <main className="mx-auto max-w-3xl px-4 py-12">
        {/* Breadcrumb */}
        <div className="text-muted-foreground mb-6 flex items-center gap-2 text-sm">
          <Link
            href={`/topics/${examSlug}` as "/"}
            className="hover:text-foreground transition-colors"
          >
            {data.examName}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{data.topicTitle}</span>
        </div>

        {/* Title */}
        <h1 className="mb-3 text-3xl font-bold tracking-tight">{data.topicTitle}</h1>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <GraduationCap className="h-3 w-3" />
            {data.examName}
          </Badge>
          {data.hasTutorial && data.tutorialWordCount && (
            <Badge variant="secondary" className="gap-1">
              <BookOpen className="h-3 w-3" />
              {Math.ceil(data.tutorialWordCount / 200)} min read
            </Badge>
          )}
          {data.noteCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <StickyNote className="h-3 w-3" />
              {data.noteCount} community notes
            </Badge>
          )}
        </div>

        {/* Summary preview */}
        {data.summaryPreview ? (
          <Card className="mb-8">
            <CardContent className="p-6">
              <p className="text-foreground/90 leading-relaxed">{data.summaryPreview}</p>
            </CardContent>
          </Card>
        ) : data.hasTutorial ? (
          <Card className="mb-8">
            <CardContent className="p-6">
              <p className="text-muted-foreground">
                A comprehensive tutorial is available for this topic. Sign up to access the full
                content, practice exams, and AI-powered study tools.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Locked content CTA */}
        <Card className="border-primary/20 from-primary/5 to-background mb-8 bg-gradient-to-b">
          <CardContent className="py-10 text-center">
            <Lock className="text-primary/60 mx-auto mb-4 h-10 w-10" />
            <h3 className="text-xl font-semibold">Continue reading the full tutorial</h3>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md">
              Create a free account to access the complete tutorial with detailed explanations,
              diagrams, practice questions, and AI-powered study assistance.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/login">
                <Button size="lg" className="gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Start Learning Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="text-muted-foreground mt-6 flex flex-wrap justify-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" /> Full tutorials
              </span>
              <span className="flex items-center gap-1">
                <StickyNote className="h-4 w-4" /> AI chat tutor
              </span>
              <span className="flex items-center gap-1">
                <GraduationCap className="h-4 w-4" /> Practice exams
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Back link */}
        <Link
          href={`/topics/${examSlug}` as "/"}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all {data.examName} topics
        </Link>
      </main>

      <footer className="border-t px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            ExamForge &mdash; AI exam preparation platform
          </p>
          <p className="text-muted-foreground text-xs">Built for Indian competitive exams</p>
        </div>
      </footer>
    </div>
  );
}

function Header({ examSlug }: { examSlug: string }): React.ReactElement {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ExamForge
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href={`/topics/${examSlug}` as "/"}
            className="text-foreground/80 hover:text-foreground text-sm transition-colors"
          >
            Topics
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
