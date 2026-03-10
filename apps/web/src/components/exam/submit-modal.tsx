"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Flag } from "lucide-react";

type SubmitModalProps = {
  answeredCount: number;
  totalCount: number;
  flaggedCount: number;
  onSubmit: () => void;
  isPending: boolean;
  children: React.ReactNode;
};

export function SubmitModal({
  answeredCount,
  totalCount,
  flaggedCount,
  onSubmit,
  isPending,
  children,
}: SubmitModalProps): React.ReactElement {
  const unanswered = totalCount - answeredCount;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Exam?</DialogTitle>
          <DialogDescription>
            Review your progress before submitting. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-4">
          <SummaryRow
            icon={<CheckCircle className="size-5 text-green-500" />}
            label="Answered"
            value={answeredCount}
            total={totalCount}
          />
          <SummaryRow
            icon={<XCircle className="size-5 text-muted-foreground" />}
            label="Unanswered"
            value={unanswered}
            total={totalCount}
            warn={unanswered > 0}
          />
          {flaggedCount > 0 && (
            <SummaryRow
              icon={<Flag className="size-5 text-orange-500" />}
              label="Flagged for review"
              value={flaggedCount}
              total={totalCount}
              warn
            />
          )}
        </div>

        {unanswered > 0 && (
          <p className="text-sm text-orange-600">
            You have {unanswered} unanswered question
            {unanswered > 1 ? "s" : ""}. Unanswered questions will be scored as
            incorrect.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline">Continue Exam</Button>
          </DialogClose>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Submitting..." : "Submit Exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  total,
  warn = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  warn?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span
        className={`text-sm font-semibold ${warn ? "text-orange-600" : ""}`}
      >
        {value} / {total}
      </span>
    </div>
  );
}
