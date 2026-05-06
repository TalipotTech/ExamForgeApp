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
};

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
  const profile = await loadProfileForMeta(slug);
  if (!profile) {
    return {
      title: "Creator not found",
      description: "This creator profile is not public on ExamForge.",
      robots: { index: false, follow: false },
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
    openGraph: {
      title,
      description,
      type: "profile",
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

export default async function CreatorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <CreatorDetailClient slug={slug} />;
}
