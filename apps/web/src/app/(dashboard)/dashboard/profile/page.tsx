"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  StickyNote,
  MessageCircle,
  Trophy,
  BookOpen,
  Clock,
  Target,
  Tag,
  FileQuestion,
  Loader2,
} from "lucide-react";
import { SubscriberGate } from "@/components/subscriber-gate";

export default function ProfilePage(): React.ReactElement {
  return (
    <SubscriberGate featureName="Learning Profile">
      <ProfileContent />
    </SubscriberGate>
  );
}

function ProfileContent(): React.ReactElement {
  const statsQuery = trpc.learn.getUserProfileStats.useQuery({}, { staleTime: 5 * 60 * 1000 });
  const keywordsQuery = trpc.learn.getUserKeywords.useQuery(
    { limit: 50 },
    { staleTime: 5 * 60 * 1000 },
  );
  const notesQuery = trpc.learn.getUserNotes.useQuery(
    { limit: 30, offset: 0 },
    { staleTime: 5 * 60 * 1000 },
  );
  const examsQuery = trpc.tutorialAgent.listUserExams.useQuery({}, { staleTime: 5 * 60 * 1000 });

  const stats = statsQuery.data;
  const keywords = keywordsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const exams = examsQuery.data ?? [];

  const formatReadTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  if (statsQuery.isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">My Learning Profile</h1>
        <p className="text-muted-foreground mt-1">
          Track your progress, notes, and exam performance
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.topicsCompleted ?? 0}</p>
              <p className="text-muted-foreground text-xs">Topics Completed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
              <StickyNote className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalNotes ?? 0}</p>
              <p className="text-muted-foreground text-xs">Notes Saved</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {stats?.totalExams ?? 0}
                {stats && stats.avgScore > 0 && (
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    ({stats.avgScore}% avg)
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs">Exams Taken</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
              <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatReadTime(stats?.totalReadTimeSeconds ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">Reading Time</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Keywords/Tags Section */}
      {keywords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              Your Search Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <Badge key={kw.keyword} variant="secondary" className="gap-1 text-xs">
                  {kw.keyword}
                  <span className="bg-muted-foreground/20 rounded-full px-1.5 text-[10px]">
                    {kw.count}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two Column Layout: Notes and Exams */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Notes Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4" />
              Recent Notes
              {notes.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {notes.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No notes saved yet. Use Ask AI while learning to save notes.
              </p>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border p-3">
                    <div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs">
                      {note.syllabusName && (
                        <span className="text-foreground truncate font-medium">
                          {note.syllabusName}
                        </span>
                      )}
                      {note.nodeTitle && (
                        <>
                          <span>›</span>
                          <span className="truncate">{note.nodeTitle}</span>
                        </>
                      )}
                    </div>
                    {note.keyword && (
                      <Badge variant="outline" className="mb-1.5 text-xs">
                        <MessageCircle className="mr-1 h-2.5 w-2.5" />
                        {note.keyword}
                      </Badge>
                    )}
                    <p className="line-clamp-3 text-sm">
                      {note.noteContent.substring(0, 200)}
                      {note.noteContent.length > 200 ? "..." : ""}
                    </p>
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exams Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileQuestion className="h-4 w-4" />
              Practice Exams
              {exams.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {exams.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exams.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No practice exams generated yet. Generate exams from your tutorials.
              </p>
            ) : (
              <div className="space-y-3">
                {exams.map((exam) => (
                  <div key={exam.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">{exam.title}</h4>
                      {exam.bestScore !== null && (
                        <Badge
                          variant={exam.bestScore >= 70 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          <Target className="mr-1 h-2.5 w-2.5" />
                          {Math.round(exam.bestScore)}%
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                      <span>{exam.questionCount} questions</span>
                      <span>
                        {exam.timesAttempted} attempt{exam.timesAttempted !== 1 ? "s" : ""}
                      </span>
                      <span>{new Date(exam.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
