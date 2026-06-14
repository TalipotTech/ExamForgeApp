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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function NewClassroomPage(): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [maxStudents, setMaxStudents] = useState("100");
  const [allowDoubts, setAllowDoubts] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const createMutation = trpc.classroom.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Classroom created. Join code: ${data.joinCode}`);
      router.push(`/creator/classrooms/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const max = Number.parseInt(maxStudents, 10);
    if (!Number.isFinite(max) || max < 1) {
      toast.error("Max students must be at least 1");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      subject: subject.trim() || undefined,
      maxStudents: max,
      isPaid: false,
      settings: { allowDoubts, showLeaderboard },
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/creator/classrooms">
          <ArrowLeft className="mr-1 size-4" />
          Classrooms
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New Classroom</CardTitle>
          <p className="text-muted-foreground text-sm">
            Share curated content with a cohort of students. They join using a unique code.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Classroom name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GPAT 2026 — Morning Batch"
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
                placeholder="What this classroom is about and who it's for"
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject / focus</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Pharmacology"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max">Max students *</Label>
                <Input
                  id="max"
                  type="number"
                  min="1"
                  step="1"
                  value={maxStudents}
                  onChange={(e) => setMaxStudents(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Settings</p>
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={allowDoubts}
                  onCheckedChange={(v) => setAllowDoubts(v === true)}
                />
                <span className="text-sm">
                  <span className="font-medium">Allow student doubts</span>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    Students can post questions to a doubt board you can answer.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={showLeaderboard}
                  onCheckedChange={(v) => setShowLeaderboard(v === true)}
                />
                <span className="text-sm">
                  <span className="font-medium">Show leaderboard</span>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    Students can compare exam scores within the classroom.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create classroom"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/creator/classrooms">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
