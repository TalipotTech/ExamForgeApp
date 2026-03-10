"use client";

import { useExamStore } from "@/stores/exam-store";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function ExamTimer(): React.ReactElement {
  const timeRemaining = useExamStore((s) => s.timeRemaining);
  const durationMinutes = useExamStore((s) => s.durationMinutes);

  const totalSeconds = durationMinutes * 60;
  const progress = totalSeconds > 0 ? (timeRemaining / totalSeconds) * 100 : 0;
  const isLow = timeRemaining < 300;
  const isCritical = timeRemaining < 60;

  return (
    <div className="flex items-center gap-2">
      <Clock
        className={cn(
          "size-4",
          isCritical
            ? "animate-pulse text-red-500"
            : isLow
              ? "text-orange-500"
              : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "min-w-[4rem] text-center font-mono text-sm font-semibold",
          isCritical ? "text-red-500" : isLow ? "text-orange-500" : "",
        )}
      >
        {formatTime(timeRemaining)}
      </span>
      <Progress
        value={progress}
        className={cn(
          "hidden h-2 w-24 sm:block",
          isCritical
            ? "[&>div]:bg-red-500"
            : isLow
              ? "[&>div]:bg-orange-500"
              : "",
        )}
      />
    </div>
  );
}
