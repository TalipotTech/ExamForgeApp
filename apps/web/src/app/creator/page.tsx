"use client";

/**
 * Creator Hub (formerly "Overview", now labelled "Dashboard" in the nav).
 *
 * Sections:
 *   1. Stats grid — listings / followers / sales / lifetime earned
 *   2. Recent Contents — last 8 uploads as a card grid with image thumbnails
 *      and hover-autoplay video previews. Drafts get an inline Publish button.
 *   3. My Listings — last 5 marketplace listings with status badges
 *   4. Classrooms — last 5 cohorts the creator teaches
 *   5. Doubt Inbox — most recent open student doubts
 *
 * Each section has a "View all →" link to the dedicated page. Skeleton
 * placeholders cover the loading state. Empty states each link to the
 * corresponding "create" CTA.
 */

import Link from "next/link";
import { useState } from "react";
import {
  Sparkles,
  Package,
  Wallet,
  ArrowRight,
  Users,
  ShoppingBag,
  FileStack,
  LayoutGrid,
  GraduationCap,
  Inbox,
  Plus,
  Globe,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ContentCard, timeAgo } from "@/components/content/content-card";

type InstitutionType = "independent" | "institute" | "student_creator" | "publisher";

function formatInr(paisa: number | null | undefined): string {
  if (!paisa) return "₹0";
  return `₹${(paisa / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function RegisterForm({ onRegistered }: { onRegistered: () => void }): React.ReactElement {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [institution, setInstitution] = useState("");
  const [institutionType, setInstitutionType] = useState<InstitutionType>("independent");
  const [qualification, setQualification] = useState("");

  const registerMutation = trpc.creator.register.useMutation({
    onSuccess: (data) => {
      if (data.alreadyRegistered) {
        toast.info("You were already registered — welcome back.");
      } else {
        toast.success("Creator profile created. Welcome aboard!");
      }
      onRegistered();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5" />
          Become a Creator
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Register once to start publishing question sets, tutorials, and courses on the ExamForge
          marketplace.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (displayName.trim().length < 2) {
              toast.error("Display name must be at least 2 characters");
              return;
            }
            registerMutation.mutate({
              displayName: displayName.trim(),
              bio: bio.trim() || undefined,
              institution: institution.trim() || undefined,
              institutionType,
              qualification: qualification.trim() || undefined,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name *</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dr. Priya Sharma"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Short intro — what you teach, your experience"
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="institution-type">Institution type</Label>
              <Select
                value={institutionType}
                onValueChange={(v) => setInstitutionType(v as InstitutionType)}
              >
                <SelectTrigger id="institution-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">Independent</SelectItem>
                  <SelectItem value="institute">Institute / coaching</SelectItem>
                  <SelectItem value="student_creator">Student creator</SelectItem>
                  <SelectItem value="publisher">Publisher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="institution">Institution / organisation</Label>
              <Input
                id="institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qualification">Qualification</Label>
            <Input
              id="qualification"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="e.g. M.Pharm, PhD, GPAT AIR 12"
            />
          </div>
          <Button type="submit" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? "Registering…" : "Register as creator"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="bg-accent rounded-md p-2">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  href,
  hrefLabel = "View all",
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href?: string;
  hrefLabel?: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4" />
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {action}
        {href && (
          <Link
            href={href as "/"}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            {hrefLabel}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyRow({
  message,
  ctaHref,
  ctaLabel,
}: {
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
}): React.ReactElement {
  return (
    <div className="text-muted-foreground bg-muted/20 flex items-center justify-between rounded-md border border-dashed px-3 py-3 text-xs">
      <span>{message}</span>
      {ctaHref && ctaLabel && (
        <Link href={ctaHref as "/"}>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            <Plus className="size-3" />
            {ctaLabel}
          </Button>
        </Link>
      )}
    </div>
  );
}

function RecentContentsSection(): React.ReactElement {
  const listQuery = trpc.creatorContent.myContent.useQuery({ page: 1, limit: 8 });
  const togglePublishMutation = trpc.creatorContent.togglePublish.useMutation({
    onSuccess: (data) => {
      toast.success(data.isPublished ? "Published" : "Unpublished");
      void listQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const items = listQuery.data?.items ?? [];
  const pendingContentId = togglePublishMutation.isPending
    ? (togglePublishMutation.variables?.contentId ?? null)
    : null;

  return (
    <section>
      <SectionHeader
        icon={FileStack}
        title="Recent Contents"
        href="/creator/content"
        action={
          <Link href="/creator/content/upload">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="size-3" />
              Upload
            </Button>
          </Link>
        }
      />
      {listQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-3">
            <EmptyRow
              message="You haven't uploaded any content yet."
              ctaHref="/creator/content/upload"
              ctaLabel="Upload content"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((c) => {
            const isPublishing = pendingContentId === c.id;
            return (
              <ContentCard
                key={c.id}
                content={{
                  id: c.id,
                  title: c.title,
                  contentType: c.contentType,
                  isPublished: c.isPublished,
                  viewCount: c.viewCount,
                  createdAt: c.createdAt,
                  thumbnailUrl: c.thumbnailUrl,
                  metadata: c.metadata,
                  subject: c.subject,
                  topic: c.topic,
                  // Deliberately omitted: "by <own creator name>" is
                  // self-referential on the creator's own dashboard.
                }}
                href={`/creator/content/${c.id}`}
                footer={
                  <>
                    {!c.isPublished && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 gap-1 text-xs"
                        title="Publish this draft"
                        disabled={isPublishing}
                        onClick={() => togglePublishMutation.mutate({ contentId: c.id })}
                      >
                        {isPublishing ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Globe className="size-3" />
                        )}
                        Publish
                      </Button>
                    )}
                    <Link
                      href={`/creator/content/${c.id}` as "/"}
                      className={c.isPublished ? "flex-1" : ""}
                    >
                      <Button
                        variant={c.isPublished ? "outline" : "ghost"}
                        size="sm"
                        className={`h-7 gap-1 text-xs ${c.isPublished ? "w-full" : ""}`}
                        title="Open"
                      >
                        <ExternalLink className="size-3" />
                        Open
                      </Button>
                    </Link>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ListingsSection(): React.ReactElement {
  const listingsQuery = trpc.marketplace.myListings.useQuery({ limit: 5 });
  const items = listingsQuery.data ?? [];
  return (
    <section>
      <SectionHeader
        icon={LayoutGrid}
        title="My Listings"
        href="/creator/listings"
        action={
          <Link href="/creator/listings/new">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="size-3" />
              New listing
            </Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="space-y-1.5 p-3">
          {listingsQuery.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : items.length === 0 ? (
            <EmptyRow
              message="No marketplace listings yet."
              ctaHref="/creator/listings/new"
              ctaLabel="Create listing"
            />
          ) : (
            items.map((l) => (
              <Link
                key={l.id}
                href={`/creator/listings` as "/"}
                className="hover:bg-muted/40 flex items-center gap-3 rounded-md border p-2.5 transition-colors"
              >
                <ShoppingBag className="size-4 text-violet-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.title}</p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                    <Badge variant="outline" className="px-1 py-0 text-[9px] capitalize">
                      {l.listingType}
                    </Badge>
                    <Badge variant="secondary" className="px-1 py-0 text-[9px] capitalize">
                      {l.status}
                    </Badge>
                    <span>· {formatInr(l.priceInr)}</span>
                    <span>· {timeAgo(l.createdAt)}</span>
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground size-3 shrink-0" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ClassroomsSection(): React.ReactElement {
  const taughtQuery = trpc.classroom.myTaught.useQuery();
  const items = (taughtQuery.data ?? []).slice(0, 5);
  return (
    <section>
      <SectionHeader
        icon={GraduationCap}
        title="Classrooms"
        href="/creator/classrooms"
        action={
          <Link href="/creator/classrooms/new">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Plus className="size-3" />
              New classroom
            </Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="space-y-1.5 p-3">
          {taughtQuery.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : items.length === 0 ? (
            <EmptyRow
              message="No classrooms yet."
              ctaHref="/creator/classrooms/new"
              ctaLabel="Create classroom"
            />
          ) : (
            items.map((c) => (
              <Link
                key={c.id}
                href={`/creator/classrooms/${c.id}` as "/"}
                className="hover:bg-muted/40 flex items-center gap-3 rounded-md border p-2.5 transition-colors"
              >
                <GraduationCap className="size-4 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                    {c.subject && <span>{c.subject}</span>}
                    {c.joinCode && (
                      <Badge variant="outline" className="px-1 py-0 font-mono text-[9px]">
                        {c.joinCode}
                      </Badge>
                    )}
                    <span>· {c.studentCount ?? 0} students</span>
                    <span>· {timeAgo(c.createdAt)}</span>
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground size-3 shrink-0" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DoubtsSection(): React.ReactElement {
  const inboxQuery = trpc.doubt.inbox.useQuery();
  const items = (inboxQuery.data ?? []).slice(0, 5);
  return (
    <section>
      <SectionHeader icon={Inbox} title="Doubt Inbox" href="/creator/doubts" />
      <Card>
        <CardContent className="space-y-1.5 p-3">
          {inboxQuery.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : items.length === 0 ? (
            <EmptyRow message="No open doubts right now. 🎉" />
          ) : (
            items.map((d) => (
              <Link
                key={d.id}
                href={`/creator/doubts/${d.id}` as "/"}
                className="hover:bg-muted/40 flex items-center gap-3 rounded-md border p-2.5 transition-colors"
              >
                <Inbox className="size-4 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {d.questionText.length > 90
                      ? `${d.questionText.slice(0, 90)}…`
                      : d.questionText}
                  </p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                    <Badge variant="secondary" className="px-1 py-0 text-[9px] capitalize">
                      {d.status}
                    </Badge>
                    {(d.upvoteCount ?? 0) > 0 && <span>· {d.upvoteCount} upvotes</span>}
                    <span>· {timeAgo(d.createdAt)}</span>
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground size-3 shrink-0" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function CreatorHubPage(): React.ReactElement {
  const meQuery = trpc.creator.me.useQuery(undefined, { staleTime: 30_000 });

  if (meQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (meQuery.error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-6 text-center text-sm">
            {meQuery.error.message.includes("FEATURE_DISABLED")
              ? "The creators ecosystem is not yet enabled."
              : meQuery.error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = meQuery.data;

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl">
        <RegisterForm onRegistered={() => meQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="size-6" />
            Creator Hub
          </h1>
          <p className="text-muted-foreground text-sm">Welcome back, {profile.displayName}.</p>
        </div>
        <Badge variant={profile.verificationStatus === "verified" ? "default" : "outline"}>
          {profile.verificationStatus}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ShoppingBag} label="Listings" value={profile.contentCount ?? 0} />
        <StatCard icon={Users} label="Followers" value={profile.followerCount ?? 0} />
        <StatCard icon={Package} label="Sales" value={profile.totalSales ?? 0} />
        <StatCard
          icon={Wallet}
          label="Lifetime earned"
          value={formatInr(profile.totalRevenueEarned)}
        />
      </div>

      {/* Recent Contents takes the full row so each card has breathing room
          for its video / image preview. The remaining three sections stay
          side-by-side in a 2-col grid below. */}
      <RecentContentsSection />

      <div className="grid gap-6 lg:grid-cols-2">
        <ListingsSection />
        <ClassroomsSection />
        <DoubtsSection />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">More</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="h-auto justify-between px-4 py-3" asChild>
              <Link href="/creator/wallet">
                <span className="flex flex-col items-start">
                  <span className="flex items-center gap-2 font-semibold">
                    <Wallet className="size-4" />
                    Wallet
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Balance, earnings history, payouts
                  </span>
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="h-auto justify-between px-4 py-3" asChild>
              <Link href="/marketplace">
                <span className="flex flex-col items-start">
                  <span className="flex items-center gap-2 font-semibold">
                    <ShoppingBag className="size-4" />
                    Public marketplace
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Browse the storefront students see
                  </span>
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
