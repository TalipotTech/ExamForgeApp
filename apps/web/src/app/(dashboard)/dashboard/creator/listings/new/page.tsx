"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type ListingType =
  | "question_set"
  | "tutorial"
  | "video"
  | "audio"
  | "course"
  | "document"
  | "bundle";

export default function NewListingPage(): React.ReactElement {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingType, setListingType] = useState<ListingType>("question_set");
  const [priceRupees, setPriceRupees] = useState<string>("199");
  const [compareAtRupees, setCompareAtRupees] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [previewContent, setPreviewContent] = useState("");

  const createMutation = trpc.marketplace.createListing.useMutation({
    onSuccess: (data) => {
      toast.success("Draft listing created. Publish it from My Listings when ready.");
      router.push(`/dashboard/creator/listings`);
      void data;
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const price = Math.round(Number.parseFloat(priceRupees) * 100);
    if (!Number.isFinite(price) || price < 100) {
      toast.error("Price must be at least ₹1");
      return;
    }
    const compareAt = compareAtRupees
      ? Math.round(Number.parseFloat(compareAtRupees) * 100)
      : undefined;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      listingType,
      priceInr: price,
      compareAtPriceInr: compareAt,
      subject: subject.trim() || undefined,
      tags: tags.length ? tags : undefined,
      coverImageUrl: coverImageUrl.trim() || undefined,
      previewContent: previewContent.trim() || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/dashboard/creator/listings">
          <ArrowLeft className="mr-1 size-4" />
          My Listings
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New Listing</CardTitle>
          <p className="text-muted-foreground text-sm">
            Your listing is saved as a draft. You can publish it from My Listings once you&apos;re
            happy with it.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="GPAT 2026 — 500 MCQs (Pharmacology)"
                required
                minLength={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's included? Who is this for?"
                rows={5}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="type">Listing type *</Label>
                <Select value={listingType} onValueChange={(v) => setListingType(v as ListingType)}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="question_set">Question set</SelectItem>
                    <SelectItem value="tutorial">Tutorial</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="course">Course</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Pharmacology"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="price">Price (₹) *</Label>
                <Input
                  id="price"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="compare-at">
                  Compare-at price (₹) <span className="text-muted-foreground">— optional</span>
                </Label>
                <Input
                  id="compare-at"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={compareAtRupees}
                  onChange={(e) => setCompareAtRupees(e.target.value)}
                  placeholder="Shown as strikethrough"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="GPAT, 2026, revision"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cover">Cover image URL</Label>
              <Input
                id="cover"
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preview">Preview content</Label>
              <Textarea
                id="preview"
                value={previewContent}
                onChange={(e) => setPreviewContent(e.target.value)}
                placeholder="A sample of what buyers get — shown on the listing page before purchase"
                rows={4}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create draft"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/creator/listings">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
