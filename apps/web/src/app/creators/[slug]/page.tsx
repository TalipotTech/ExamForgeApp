import type { Metadata } from "next";
import { and, eq, or } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { creatorProfiles } from "@examforge/shared/db/schema";
import { CreatorDetailClient } from "./client";

type ProfileSummary = {
  displayName: string;
  bio: string | null;
  coverImageUrl: string | null;
  avatarUrl: string | null;
  institution: string | null;
  qualification: string | null;
  websiteUrl: string | null;
  followerCount: number | null;
  averageRating: number | null;
  totalRatings: number | null;
};

const SITE_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://ice.ensate.in";

async function loadProfileForMeta(slug: string): Promise<ProfileSummary | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  const db = createDatabase(databaseUrl);
  const visibility = or(
    eq(creatorProfiles.verificationStatus, "verified"),
    eq(creatorProfiles.verificationStatus, "featured"),
  );
  const conds = [eq(creatorProfiles.slug, slug), eq(creatorProfiles.isActive, true)];
  if (visibility) conds.push(visibility);
  const [row] = await db
    .select({
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      coverImageUrl: creatorProfiles.coverImageUrl,
      avatarUrl: creatorProfiles.avatarUrl,
      institution: creatorProfiles.institution,
      qualification: creatorProfiles.qualification,
      websiteUrl: creatorProfiles.websiteUrl,
      followerCount: creatorProfiles.followerCount,
      averageRating: creatorProfiles.averageRating,
      totalRatings: creatorProfiles.totalRatings,
    })
    .from(creatorProfiles)
    .where(and(...conds))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = `${SITE_BASE_URL}/creators/${slug}`;
  const profile = await loadProfileForMeta(slug);
  if (!profile) {
    return {
      title: "Creator not found",
      description: "This creator profile is not public on ExamForge.",
      robots: { index: false, follow: false },
      alternates: { canonical },
    };
  }
  const title = `${profile.displayName} — ExamForge creator`;
  const description =
    profile.bio?.slice(0, 200) ??
    `${profile.displayName} on ExamForge — published exam-prep content, classrooms, and more.`;
  const ogImage = profile.coverImageUrl ?? profile.avatarUrl ?? undefined;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonical,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function buildPersonJsonLd(slug: string, profile: ProfileSummary): Record<string, unknown> {
  const url = `${SITE_BASE_URL}/creators/${slug}`;
  const aggregateRating =
    (profile.totalRatings ?? 0) > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: (profile.averageRating ?? 0).toFixed(2),
          ratingCount: profile.totalRatings ?? 0,
          bestRating: 5,
          worstRating: 0,
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.displayName,
    url,
    image: profile.avatarUrl ?? profile.coverImageUrl ?? undefined,
    description: profile.bio ?? undefined,
    sameAs: profile.websiteUrl ? [profile.websiteUrl] : undefined,
    jobTitle: profile.qualification ?? undefined,
    worksFor: profile.institution
      ? { "@type": "Organization", name: profile.institution }
      : undefined,
    aggregateRating,
  };
}

export default async function CreatorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const profile = await loadProfileForMeta(slug);
  return (
    <>
      {profile && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildPersonJsonLd(slug, profile)),
          }}
        />
      )}
      <CreatorDetailClient slug={slug} />
    </>
  );
}
