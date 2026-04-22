import Link from "next/link";
import {
  BookOpen,
  Brain,
  BarChart3,
  Sparkles,
  GraduationCap,
  ArrowRight,
  Zap,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExamShowcase } from "@/components/home/exam-showcase";
import { ExaminationList } from "@/components/home/examination-list";
import { TopicExplorer } from "@/components/home/topic-explorer";
import { PopularTags } from "@/components/home/popular-tags";
import { SiteStats } from "@/components/home/site-stats";

const FEATURES = [
  {
    icon: Brain,
    title: "AI Question Generation",
    description:
      "Generate high-quality MCQs, true/false, and assertion-reasoning questions using Claude, Gemini, and Mistral AI models.",
  },
  {
    icon: BookOpen,
    title: "Massive Question Bank",
    description:
      "Browse, filter, and study from thousands of curated questions organized by subject, topic, and difficulty.",
  },
  {
    icon: Target,
    title: "Realistic Mock Exams",
    description:
      "Take timed practice tests that mirror the actual exam pattern with instant scoring and detailed analytics.",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description:
      "Track your progress with detailed reports on strengths, weaknesses, and topic-wise performance over time.",
  },
  {
    icon: Zap,
    title: "Instant Explanations",
    description:
      "Every question comes with a detailed AI-generated explanation to deepen your understanding.",
  },
  {
    icon: Sparkles,
    title: "Multi-Language Support",
    description:
      "Study in English, Hindi, Tamil, or Malayalam — AI-powered translations for every question.",
  },
] as const;

const EXAMS = ["BPharm Asst Prof", "GPAT", "NEET", "UPSC", "Kerala PSC", "GATE"] as const;

export default function HomePage(): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-bold tracking-tight">ExamForge</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/exams"
              className="text-foreground/80 hover:text-foreground text-sm transition-colors"
            >
              Exams
            </Link>
            <Link
              href="/marketplace"
              className="text-foreground/80 hover:text-foreground text-sm transition-colors"
            >
              Marketplace
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-20 text-center md:pt-28">
        <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm">
          <Sparkles className="size-3.5" />
          AI-Powered Exam Prep
        </Badge>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Ace your exams with{" "}
          <span className="from-primary/80 to-primary bg-gradient-to-r bg-clip-text text-transparent">
            AI-powered
          </span>{" "}
          preparation
        </h1>

        <p className="text-muted-foreground mt-6 max-w-2xl text-lg sm:text-xl">
          Generate questions, take mock tests, and track your progress — all powered by advanced AI.
          Built for Indian competitive exams.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/login">
            <Button size="lg" className="gap-2 text-base">
              <GraduationCap className="size-5" />
              Start Practicing
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        {/* Exam badges */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {EXAMS.map((exam) => (
            <Badge key={exam} variant="outline" className="text-xs">
              {exam}
            </Badge>
          ))}
        </div>
      </section>

      {/* Site Stats */}
      <SiteStats />

      {/* Examination Schedule Cards from DB */}
      <ExaminationList />

      {/* Popular Topics */}
      <PopularTags />

      {/* Features */}
      <section className="bg-muted/30 border-t px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to succeed</h2>
            <p className="text-muted-foreground mt-3">
              A complete platform designed for serious exam preparation.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="bg-background border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="bg-primary/10 mb-4 flex size-10 items-center justify-center rounded-lg">
                    <feature.icon className="text-primary size-5" />
                  </div>
                  <h3 className="mb-2 font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Explore Topics */}
      <TopicExplorer />

      {/* Exam Showcase */}
      <ExamShowcase />

      {/* CTA */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to start preparing?</h2>
          <p className="text-muted-foreground mt-3">
            Join ExamForge today and let AI supercharge your exam preparation.
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button size="lg" className="gap-2 text-base">
                Get Started Free
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
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
