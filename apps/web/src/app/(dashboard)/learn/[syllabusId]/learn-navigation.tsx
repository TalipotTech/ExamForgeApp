"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface LearnNavigationProps {
  prevNode: { id: number; title: string } | null;
  nextNode: { id: number; title: string } | null;
  onNavigate: (nodeId: number) => void;
}

export function LearnNavigation({
  prevNode,
  nextNode,
  onNavigate,
}: LearnNavigationProps): React.ReactElement {
  return (
    <div className="mt-8 flex items-stretch justify-between gap-4 border-t pt-6">
      {prevNode ? (
        <Button
          variant="outline"
          onClick={() => onNavigate(prevNode.id)}
          className="h-auto max-w-[45%] flex-col items-start gap-0.5 px-4 py-3 text-left"
        >
          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
            <ChevronLeft className="h-3 w-3" />
            Previous
          </span>
          <span className="truncate text-xs font-medium">{prevNode.title}</span>
        </Button>
      ) : (
        <div />
      )}

      {nextNode ? (
        <Button
          variant="outline"
          onClick={() => onNavigate(nextNode.id)}
          className="h-auto max-w-[45%] flex-col items-end gap-0.5 px-4 py-3 text-right"
        >
          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
            Next
            <ChevronRight className="h-3 w-3" />
          </span>
          <span className="truncate text-xs font-medium">{nextNode.title}</span>
        </Button>
      ) : (
        <div />
      )}
    </div>
  );
}
