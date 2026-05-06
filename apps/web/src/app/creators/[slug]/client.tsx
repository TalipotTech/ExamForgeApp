"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentCard, type ContentCardData } from "@/components/content/content-card";
import { trpc } from "@/lib/trpc";

const STALE_TIME = 5 * 60 * 1000;

type TabValue = "content" | "classrooms" | "about";

export function CreatorDetailClient({ slug }: { slug: string }): React.ReactElement {
  const [tab, setTab] = useState<TabValue>("content");
  const { data, isLoading, error } = trpc.creator.bySlug.useQuery(
    { slug },
    { staleTime: STALE_TIME, retry: false },
  );

  if (isLoading) {
    return (
      <div className="bg-background min-h-screen">
        <Header />
        <div className="mx-auto max-w-5xl space-y-4 p-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-background min-h-screen">
        <Header />
        <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
          <div>
            <h1 className="text-2xl font-bold">Creator not found</h1>
            <p className="text-muted-foreground mt-2">
              This profile may be private or no longer active.
            </p>
            <Link href={"/creators" as "/"}>
              <Button className="mt-4 gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to directory
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { profile, content, classrooms } = data;

  return (
    <div className="bg-background min-h-screen">
      <Header />

      <Hero profile={profile} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="content">Content ({content.length})</TabsTrigger>
            <TabsTrigger value="classrooms">Classrooms ({classrooms.length})</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-4">
            {content.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground p-10 text-center text-sm">
                  This creator hasn&apos;t published anything yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {content.map((item) => {
                  const cardData: ContentCardData = {
                    id: item.id,
                    title: item.title,
                    contentType: item.contentType,
                    isPublished: item.isPublished,
                    viewCount: item.viewCount,
                    createdAt: item.createdAt,
                    thumbnailUrl: item.thumbnailUrl,
                    metadata: item.metadata,
                    subject: item.subject,
                    topic: item.topic,
                    creatorDisplayName: profile.displayName,
                  };
                  return (
                    <ContentCard
                      key={item.id}
                      content={cardData}
                      href={`/marketplace/content/${item.id}`}
                      showPublishedBadge={false}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="classrooms" className="mt-4">
            {classrooms.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground p-10 text-center text-sm">
                  No public classrooms yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {classrooms.map((cls) => (
                  <Card key={cls.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="text-muted-foreground h-4 w-4" />
                        <h3 className="truncate font-semibold">{cls.name}</h3>
                      </div>
                      {cls.description && (
                        <p className="text-muted-foreground line-clamp-2 text-sm">
                          {cls.description}
                        </p>
                      )}
                      <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                        {cls.subject && (
                          <Badge variant="outline" className="text-xs">
                            {cls.subject}
                          </Badge>
                        )}
                        <span>
                          {cls.studentCount} / {cls.maxStudents} students
                        </span>
                      </div>
                      <div className="text-muted-foreground border-t pt-2 text-xs">
                        Free classroom · join code{" "}
                        <code className="bg-muted rounded px-1.5 py-0.5 font-mono">
                          {cls.joinCode}
                        </code>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="about" className="mt-4">
            <AboutCard profile={profile} />
          </TabsContent>
        </Tabs>
      </main>

      <PublicFooter />
    </div>
  );
}

function Hero({
  profile,
}: {
  profile: {
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    coverImageUrl: string | null;
    institution: string | null;
    verificationStatus: string;
    isFeatured: boolean | null;
    followerCount: number | null;
    averageRating: number | null;
    totalRatings: number | null;
    websiteUrl: string | null;
    youtubeUrl: string | null;
    socialLinks: {
      twitter?: string;
      instagram?: string;
      linkedin?: string;
      telegram?: string;
    } | null;
  };
}): React.ReactElement {
  const initials = useMemo(
    () =>
      profile.displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("") || "C",
    [profile.displayName],
  );
  const verified =
    profile.verificationStatus === "verified" || profile.verificationStatus === "featured";

  return (
    <div className="relative">
      <div className="bg-muted h-48 w-full sm:h-60">
        {profile.coverImageUrl ? (
          <img src={profile.coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="from-muted to-accent/20 h-full w-full bg-gradient-to-br" />
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4">
        <div className="-mt-12 flex flex-col gap-4 pb-2 sm:flex-row sm:items-end">
          <Avatar src={profile.avatarUrl} initials={initials} />

          <div className="min-w-0 flex-1 sm:pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {profile.displayName}
              </h1>
              {profile.isFeatured && (
                <Badge className="gap-1 bg-amber-100 text-amber-800">
                  <Award className="h-3 w-3" />
                  Featured
                </Badge>
              )}
              {verified && (
                <Badge className="gap-1 bg-emerald-100 text-emerald-800">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            {profile.institution && (
              <p className="text-muted-foreground mt-1 text-sm">{profile.institution}</p>
            )}
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {(profile.averageRating ?? 0).toFixed(1)}
                {profile.totalRatings ? ` (${profile.totalRatings})` : ""}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {(profile.followerCount ?? 0).toLocaleString("en-IN")} followers
              </span>
            </div>
          </div>

          <div className="flex shrink-0 gap-2 sm:pb-2">
            <Link href={"/login" as "/"} className="hidden sm:block">
              <Button>Follow</Button>
            </Link>
            <Link href={"/login" as "/"} className="sm:hidden">
              <Button size="sm">Follow</Button>
            </Link>
          </div>
        </div>

        {profile.bio && (
          <p className="text-foreground/90 mt-4 max-w-3xl text-sm leading-relaxed">{profile.bio}</p>
        )}

        <SocialLinks
          websiteUrl={profile.websiteUrl}
          youtubeUrl={profile.youtubeUrl}
          social={profile.socialLinks ?? null}
        />
      </div>
    </div>
  );
}

function Avatar({ src, initials }: { src: string | null; initials: string }): React.ReactElement {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="bg-background size-24 shrink-0 rounded-full border-4 object-cover shadow-sm"
      />
    );
  }
  return (
    <div className="bg-accent text-accent-foreground border-background flex size-24 shrink-0 items-center justify-center rounded-full border-4 text-2xl font-semibold shadow-sm">
      {initials}
    </div>
  );
}

function SocialLinks({
  websiteUrl,
  youtubeUrl,
  social,
}: {
  websiteUrl: string | null;
  youtubeUrl: string | null;
  social: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    telegram?: string;
  } | null;
}): React.ReactElement | null {
  const links: { label: string; href: string }[] = [];
  if (websiteUrl) links.push({ label: "Website", href: websiteUrl });
  if (youtubeUrl) links.push({ label: "YouTube", href: youtubeUrl });
  if (social?.twitter) links.push({ label: "Twitter", href: social.twitter });
  if (social?.instagram) links.push({ label: "Instagram", href: social.instagram });
  if (social?.linkedin) links.push({ label: "LinkedIn", href: social.linkedin });
  if (social?.telegram) links.push({ label: "Telegram", href: social.telegram });
  if (links.length === 0) return null;

  return (
    <div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          {link.label}
        </a>
      ))}
    </div>
  );
}

function AboutCard({
  profile,
}: {
  profile: {
    institution: string | null;
    institutionType: string | null;
    qualification: string | null;
    specializations: string[] | null;
    examsCovered: string[] | null;
  };
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="space-y-4 p-5 text-sm">
        {profile.qualification && <Row label="Qualification" value={profile.qualification} />}
        {profile.institution && (
          <Row
            label="Institution"
            value={
              profile.institutionType
                ? `${profile.institution} (${profile.institutionType})`
                : profile.institution
            }
          />
        )}
        {profile.specializations && profile.specializations.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs uppercase">Specializations</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.specializations.map((spec) => (
                <Badge key={spec} variant="outline">
                  {spec}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {profile.examsCovered && profile.examsCovered.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs uppercase">Exams covered</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.examsCovered.map((exam) => (
                <Badge key={exam} variant="secondary" className="font-mono text-xs">
                  {exam}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-0.5">{value}</div>
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
            href={"/exams" as "/"}
            className="text-foreground/80 hover:text-foreground text-sm transition-colors"
          >
            Exams
          </Link>
          <Link
            href={"/creators" as "/"}
            className="text-foreground/80 hover:text-foreground text-sm transition-colors"
          >
            Creators
          </Link>
          <Link href={"/login" as "/"}>
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
