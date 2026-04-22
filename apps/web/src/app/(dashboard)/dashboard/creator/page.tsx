"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles, Package, Wallet, ArrowRight, Users, ShoppingBag } from "lucide-react";
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
    <div className="mx-auto max-w-4xl space-y-6">
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Button variant="outline" className="h-auto justify-between px-4 py-4" asChild>
          <Link href="/dashboard/creator/listings">
            <span className="flex flex-col items-start">
              <span className="font-semibold">My Listings</span>
              <span className="text-muted-foreground text-xs">
                Manage published & draft listings
              </span>
            </span>
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button variant="outline" className="h-auto justify-between px-4 py-4" asChild>
          <Link href="/dashboard/creator/listings/new">
            <span className="flex flex-col items-start">
              <span className="font-semibold">New Listing</span>
              <span className="text-muted-foreground text-xs">
                Publish a question set or tutorial
              </span>
            </span>
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button variant="outline" className="h-auto justify-between px-4 py-4" asChild>
          <Link href="/dashboard/creator/wallet">
            <span className="flex flex-col items-start">
              <span className="font-semibold">Wallet</span>
              <span className="text-muted-foreground text-xs">
                Balance, earnings history, payouts
              </span>
            </span>
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
