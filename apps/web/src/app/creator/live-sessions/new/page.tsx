"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, MonitorPlay, Radio, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

type MeetingSource = "manual" | "zoom" | "embedded";

export default function NewLiveSessionPage(): React.ReactElement {
  const router = useRouter();
  const classroomsQuery = trpc.classroom.myTaught.useQuery();
  const zoomStatusQuery = trpc.zoomIntegration.status.useQuery();
  const embeddedConfiguredQuery = trpc.liveSession.embeddedConfigured.useQuery();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt());
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [meetingSource, setMeetingSource] = useState<MeetingSource>("manual");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [autoRecord, setAutoRecord] = useState(true);
  const [muteOnEntry, setMuteOnEntry] = useState(true);
  const [waitingRoom, setWaitingRoom] = useState(true);
  // Embedded-specific knobs
  const [embeddedRecord, setEmbeddedRecord] = useState(true);
  const [embeddedChat, setEmbeddedChat] = useState(true);
  const [maxAttendees, setMaxAttendees] = useState("100");
  const [classroomId, setClassroomId] = useState<string>("none");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [isFree, setIsFree] = useState(true);
  const [priceInr, setPriceInr] = useState("");

  const zoomConnected = zoomStatusQuery.data?.connected ?? false;
  const embeddedConfigured = embeddedConfiguredQuery.data?.configured ?? false;

  // Default-pick precedence per spec:
  //   embedded (if configured AND zoom not connected)
  //   > zoom (if connected)
  //   > manual (always available)
  // Apply once both feature-detection queries have resolved.
  const [defaultApplied, setDefaultApplied] = useState(false);
  useEffect(() => {
    if (defaultApplied) return;
    if (!zoomStatusQuery.isSuccess || !embeddedConfiguredQuery.isSuccess) return;
    if (embeddedConfigured && !zoomConnected) setMeetingSource("embedded");
    else if (zoomConnected) setMeetingSource("zoom");
    setDefaultApplied(true);
  }, [
    defaultApplied,
    zoomStatusQuery.isSuccess,
    embeddedConfiguredQuery.isSuccess,
    zoomConnected,
    embeddedConfigured,
  ]);

  const scheduleManual = trpc.liveSession.schedule.useMutation({
    onSuccess: () => {
      toast.success("Live session scheduled");
      router.push("/creator/live-sessions");
    },
    onError: (err) => toast.error(err.message),
  });

  const scheduleZoom = trpc.liveSession.scheduleViaZoom.useMutation({
    onSuccess: () => {
      toast.success("Zoom meeting created and session scheduled");
      router.push("/creator/live-sessions");
    },
    onError: (err) => toast.error(err.message),
  });

  const scheduleEmbedded = trpc.liveSession.scheduleEmbedded.useMutation({
    onSuccess: () => {
      toast.success("Embedded session scheduled");
      router.push("/creator/live-sessions");
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending =
    scheduleManual.isPending || scheduleZoom.isPending || scheduleEmbedded.isPending;

  const baseValid =
    title.trim().length >= 3 &&
    scheduledAt.length > 0 &&
    !isPending &&
    (isFree || (priceInr !== "" && Number(priceInr) > 0));

  const canSubmit =
    baseValid &&
    (meetingSource === "manual"
      ? meetingUrl.startsWith("https://")
      : meetingSource === "zoom"
        ? zoomConnected
        : /* embedded */ embeddedConfigured && Number(maxAttendees) >= 2);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (meetingSource === "zoom") {
      scheduleZoom.mutate({
        classroomId: classroomId === "none" ? undefined : classroomId,
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: localStringToDate(scheduledAt),
        durationMinutes: Number(durationMinutes),
        autoRecord,
        muteOnEntry,
        waitingRoom,
        subject: subject.trim() || undefined,
        topic: topic.trim() || undefined,
        isFree,
        priceInr: isFree ? undefined : Number(priceInr),
      });
      return;
    }
    if (meetingSource === "embedded") {
      scheduleEmbedded.mutate({
        classroomId: classroomId === "none" ? undefined : classroomId,
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: localStringToDate(scheduledAt),
        durationMinutes: Number(durationMinutes),
        enableRecording: embeddedRecord,
        enableChat: embeddedChat,
        maxAttendees: Number(maxAttendees),
        subject: subject.trim() || undefined,
        topic: topic.trim() || undefined,
        isFree,
        priceInr: isFree ? undefined : Number(priceInr),
      });
      return;
    }
    scheduleManual.mutate({
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

            {/* Meeting source selector — radios appear conditionally:
                  - "Paste my own URL" is always shown.
                  - "Auto-create with Zoom" only when the creator has
                    connected their Zoom account.
                  - "Embedded HD video" only when HMS_APP_ACCESS_KEY is
                    configured platform-wide (server feature-detects). */}
            <div className="space-y-3 rounded-md border p-3">
              <Label className="text-sm font-semibold">Meeting source</Label>
              <RadioGroup
                value={meetingSource}
                onValueChange={(v) => setMeetingSource(v as MeetingSource)}
                className="gap-3"
              >
                {embeddedConfigured && (
                  <label
                    htmlFor="src-embedded"
                    className="has-[input:checked]:border-primary has-[input:checked]:bg-accent/30 flex cursor-pointer items-start gap-2 rounded-md border p-3"
                  >
                    <RadioGroupItem id="src-embedded" value="embedded" className="mt-1" />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center gap-1.5 font-medium">
                        <MonitorPlay className="size-3.5" />
                        Embedded HD video
                        <span className="text-muted-foreground ml-1 text-xs font-normal">
                          (recommended)
                        </span>
                      </div>
                      <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                        <li>✓ Students never leave ExamForge</li>
                        <li>✓ Auto-recording, attendance, host controls built-in</li>
                        <li>ⓘ ~1.5 Mbps bandwidth per student</li>
                      </ul>
                    </div>
                  </label>
                )}

                {zoomConnected && (
                  <label
                    htmlFor="src-zoom"
                    className="has-[input:checked]:border-primary has-[input:checked]:bg-accent/30 flex cursor-pointer items-start gap-2 rounded-md border p-3"
                  >
                    <RadioGroupItem id="src-zoom" value="zoom" className="mt-1" />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Video className="size-3.5" />
                        Auto-create with Zoom
                        {!embeddedConfigured && (
                          <span className="text-muted-foreground ml-1 text-xs font-normal">
                            (recommended)
                          </span>
                        )}
                      </div>
                      <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                        <li>✓ Recording auto-uploaded to your Zoom</li>
                        <li>✓ Passcode auto-generated; URL works for everyone you share it with</li>
                      </ul>
                    </div>
                  </label>
                )}

                <label
                  htmlFor="src-manual"
                  className="has-[input:checked]:border-primary has-[input:checked]:bg-accent/30 flex cursor-pointer items-start gap-2 rounded-md border p-3"
                >
                  <RadioGroupItem id="src-manual" value="manual" className="mt-1" />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">Paste my own URL</div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Bring your own Meet, Teams, or Zoom personal-room link.
                    </p>
                  </div>
                </label>
              </RadioGroup>

              {!zoomConnected && !embeddedConfigured && (
                <p className="text-muted-foreground pt-1 text-xs">
                  <Link href="/creator/integrations" className="underline-offset-2 hover:underline">
                    Connect Zoom <ExternalLink className="ml-0.5 inline size-3" />
                  </Link>{" "}
                  to enable auto-create + auto-recording.
                </p>
              )}
            </div>

            {meetingSource === "zoom" && (
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">Zoom meeting settings</Label>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={autoRecord}
                      onChange={(e) => setAutoRecord(e.target.checked)}
                      className="size-4"
                    />
                    Auto-record to cloud
                  </Label>
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={muteOnEntry}
                      onChange={(e) => setMuteOnEntry(e.target.checked)}
                      className="size-4"
                    />
                    Mute participants on entry
                  </Label>
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={waitingRoom}
                      onChange={(e) => setWaitingRoom(e.target.checked)}
                      className="size-4"
                    />
                    Waiting room
                  </Label>
                </div>
              </div>
            )}

            {meetingSource === "embedded" && (
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">Embedded room settings</Label>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={embeddedRecord}
                      onChange={(e) => setEmbeddedRecord(e.target.checked)}
                      className="size-4"
                    />
                    Enable recording
                  </Label>
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={embeddedChat}
                      onChange={(e) => setEmbeddedChat(e.target.checked)}
                      className="size-4"
                    />
                    Enable chat
                  </Label>
                  <div className="space-y-1 pt-1">
                    <Label htmlFor="maxAttendees" className="text-xs">
                      Max attendees
                    </Label>
                    <Input
                      id="maxAttendees"
                      type="number"
                      min={2}
                      max={1000}
                      value={maxAttendees}
                      onChange={(e) => setMaxAttendees(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {meetingSource === "manual" && (
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
            )}

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
                {isPending
                  ? meetingSource === "zoom"
                    ? "Creating Zoom meeting…"
                    : meetingSource === "embedded"
                      ? "Creating embedded room…"
                      : "Scheduling…"
                  : "Schedule session"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
