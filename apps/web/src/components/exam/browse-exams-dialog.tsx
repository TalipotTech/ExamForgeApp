"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Plus, Crown, BookOpen, ExternalLink, Loader2 } from "lucide-react";

interface BrowseExamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BrowseExamsDialog({
  open,
  onOpenChange,
}: BrowseExamsDialogProps): React.ReactElement {
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.exam.listBrowsable.useQuery(
    { search: search || undefined },
    { enabled: open },
  );

  const addExam = trpc.onboarding.addUserExam.useMutation({
    onSuccess: () => {
      toast.success("Exam added to your list");
      utils.exam.listForUser.invalidate();
      utils.exam.listBrowsable.invalidate();
      utils.learn.getDashboardData.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const atLimit = data ? data.userExamCount >= data.maxExams : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Browse Examinations</DialogTitle>
          <DialogDescription>
            {data ? (
              <>
                Using{" "}
                <span className="font-semibold">
                  {data.userExamCount} of {data.maxExams}
                </span>{" "}
                exams ({data.planName} plan)
              </>
            ) : (
              "Find and add exams to your preparation list"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search exams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : data?.exams.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {search ? "No matching exams found" : "You've added all available exams"}
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-2">
              {data?.exams.map((exam) => (
                <div key={exam.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{exam.name}</span>
                      <Link
                        href={`/exams/${exam.id}`}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="View details"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {exam.category && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {exam.category}
                        </Badge>
                      )}
                      {exam.hasSyllabus && (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        >
                          <BookOpen className="mr-0.5 size-2.5" />
                          Syllabus
                        </Badge>
                      )}
                      {exam.questionCount != null && exam.questionCount > 0 && (
                        <span className="text-muted-foreground text-[10px]">
                          {exam.questionCount} Qs
                        </span>
                      )}
                      {exam.conductingBody && (
                        <span className="text-muted-foreground max-w-[120px] truncate text-[10px]">
                          {exam.conductingBody}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {atLimit ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/pricing">
                          <Crown className="mr-1 size-3.5 text-amber-500" />
                          Upgrade
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addExam.mutate({ examId: exam.id })}
                        disabled={addExam.isPending}
                      >
                        {addExam.isPending ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <Plus className="mr-1 size-3.5" />
                        )}
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {atLimit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <Crown className="mr-1 inline-block size-4" />
            You&apos;ve reached the exam limit for your {data?.planName} plan.{" "}
            <Link href="/pricing" className="font-semibold underline">
              Upgrade to add more
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
