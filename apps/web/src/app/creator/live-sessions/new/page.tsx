"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { trpc } from "@/lib/trpc";

// `<input type="datetime-local">` returns a string in the browser's local
// timezone with no offset. Coerce to a Date so the server gets a UTC ISO.
function localStringToDate(s: string): Date {
  return new Date(s);
}

// Round to the next 15-minute slot for a friendlier default.
function defaultScheduledAt(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 15));
  d.setSeconds(0, 0);
  // Strip the timezone offset for datetime-local.
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function NewLiveSessionPage(): React.ReactElement {
  const router = useRouter();
  const classroomsQuery = trpc.classroom.myTaught.useQuery();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt());
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [classroomId, setClassroomId] = useState<string>("none");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [isFree, setIsFree] = useState(true);
  const [priceInr, setPriceInr] = useState("");

  const scheduleMutation = trpc.liveSession.schedule.useMutation({
    onSuccess: () => {
      toast.success("Live session scheduled");
      router.push("/creator/live-sessions");
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit =
    title.trim().length >= 3 &&
    meetingUrl.startsWith("https://") &&
    scheduledAt.length > 0 &&
    !scheduleMutation.isPending &&
    (isFree || (priceInr !== "" && Number(priceInr) > 0));

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    scheduleMutation.mutate({
      classroomId: classroomId === "none" ? undefined : classroomId,
      title: title.trim(),
      description: description.trim() || undefined,
      scheduledAt: localStringToDate(scheduledAt),
      durationMinutes: Number(durationMinutes),
      meetingUrl: meetingUrl.trim(),
      subject: subject.trim() || undefined,
      topic: topic.trim() || undefined,
      isFree,
      priceInr: isFree ? undefined : Number(priceInr),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/creator/live-sessions">
            <ArrowLeft className="mr-1 size-4" />
            Live sessions
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Radio className="size-6" />
          Schedule live session
        </h1>
      </div>

      <form onSubmit={submit}>
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Pharmacology MCQ revision"
                required
                minLength={3}
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will you cover in this session?"
                rows={3}
                maxLength={5000}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Starts at *</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min={5}
                  max={480}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meetingUrl">Meeting URL *</Label>
              <Input
                id="meetingUrl"
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                required
                pattern="https://.*"
              />
              <p className="text-muted-foreground text-xs">
                Create a meeting in{" "}
                <a
                  href="https://meet.google.com/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Google Meet
                </a>
                , Zoom, or Teams and paste the link here.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="classroom">Classroom (optional)</Label>
              <Select value={classroomId} onValueChange={setClassroomId}>
                <SelectTrigger id="classroom">
                  <SelectValue placeholder="No classroom — open to all" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No classroom — open to all</SelectItem>
                  {(classroomsQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Bind to a classroom to restrict joining to its members.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Pharmacology"
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Adrenergic agonists"
                  maxLength={255}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  className="size-4"
                />
                Free for all
              </Label>
              {!isFree && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="price">Price (₹) *</Label>
                  <Input
                    id="price"
                    type="number"
                    min={1}
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    placeholder="199"
                    required
                  />
                  <p className="text-xs text-amber-600">
                    Heads-up: paid live-session checkout is not yet wired up. Students won&apos;t be
                    able to join until checkout ships.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/creator/live-sessions">Cancel</Link>
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {scheduleMutation.isPending ? "Scheduling…" : "Schedule session"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
