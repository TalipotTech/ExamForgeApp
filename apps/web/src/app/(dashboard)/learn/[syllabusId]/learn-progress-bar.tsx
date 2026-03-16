"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface LearnProgressBarProps {
  stats: {
    totalTopics: number;
    completedTopics: number;
    overallPercent: number;
  };
  className?: string;
}

export function LearnProgressBar({ stats, className }: LearnProgressBarProps): React.ReactElement {
  return (
    <div className={cn(className)}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {stats.completedTopics}/{stats.totalTopics} topics
        </span>
        <span className="font-medium">{stats.overallPercent}%</span>
      </div>
      <Progress value={stats.overallPercent} className="h-1.5" />
    </div>
  );
}
