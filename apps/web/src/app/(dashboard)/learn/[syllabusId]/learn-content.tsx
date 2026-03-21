"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, BookOpen, CheckCircle2, Mic } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { LearnChat } from "./learn-chat";
import { LearnNotes } from "./learn-notes";
import { SelectionTooltip } from "./selection-tooltip";

type TutorialSection = {
  id: string;
  title: string;
  htmlContent: string;
  plainText: string;
  order: number;
};

interface LearnContentProps {
  examId?: string;
  tutorial: {
    id: number;
    title: string;
    sections: TutorialSection[];
    wordCount: number | null;
    estimatedReadMinutes: number | null;
    sectionsCount: number | null;
    hasDiagrams: boolean | null;
    hasFormulas: boolean | null;
    hasTables: boolean | null;
    hasMnemonics: boolean | null;
    keyTerms: string[] | null;
    progress: {
      sectionsRead: string[];
      completionPercent: number;
      totalReadTimeSeconds: number;
    };
  };
  syllabusId: number;
  syllabusNodeId: number;
  onChatDockChange?: (docked: boolean) => void;
}

export function LearnContent({
  examId,
  tutorial,
  syllabusId,
  syllabusNodeId,
  onChatDockChange,
}: LearnContentProps): React.ReactElement {
  const utils = trpc.useUtils();
  const isComplete = tutorial.progress.completionPercent >= 100;
  const [askAiText, setAskAiText] = useState("");
  const sectionsContainerRef = useRef<HTMLDivElement>(null);

  const markReadMutation = trpc.learn.markSectionRead.useMutation({
    onSuccess: () => {
      utils.learn.getTutorialContent.invalidate({ syllabusNodeId });
      utils.learn.getSyllabusLearningTree.invalidate({ syllabusId });
    },
  });

  const markCompleteMutation = trpc.learn.markTopicComplete.useMutation({
    onSuccess: () => {
      toast.success("Topic marked as complete!");
      utils.learn.getTutorialContent.invalidate({ syllabusNodeId });
      utils.learn.getSyllabusLearningTree.invalidate({ syllabusId });
    },
    onError: (err) => toast.error(err.message),
  });

  const sectionsReadRef = useRef(new Set(tutorial.progress.sectionsRead));
  sectionsReadRef.current = new Set(tutorial.progress.sectionsRead);
  const observedSections = useRef(new Map<string, NodeJS.Timeout>());

  const tutorialIdRef = useRef(tutorial.id);
  tutorialIdRef.current = tutorial.id;

  const handleSectionVisible = useCallback(
    (sectionId: string) => {
      if (sectionsReadRef.current.has(sectionId)) return;
      if (observedSections.current.has(sectionId)) return;

      // Mark as read after 5 seconds of visibility
      const timer = setTimeout(() => {
        markReadMutation.mutate({
          tutorialFileId: tutorialIdRef.current,
          sectionId,
          syllabusId,
          syllabusNodeId,
        });
        observedSections.current.delete(sectionId);
      }, 5000);

      observedSections.current.set(sectionId, timer);
    },
    [markReadMutation, syllabusId, syllabusNodeId],
  );

  const handleSectionHidden = useCallback((sectionId: string) => {
    const timer = observedSections.current.get(sectionId);
    if (timer) {
      clearTimeout(timer);
      observedSections.current.delete(sectionId);
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = observedSections.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <article className="tutorial-reader">
      {/* Header */}
      <header className="mb-6 border-b pb-4">
        <h1 className="mb-3 text-2xl font-bold">{tutorial.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {tutorial.estimatedReadMinutes && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              {tutorial.estimatedReadMinutes} min read
            </Badge>
          )}
          {tutorial.sectionsCount && (
            <Badge variant="secondary" className="gap-1">
              <BookOpen className="h-3 w-3" />
              {tutorial.sectionsCount} sections
            </Badge>
          )}
          {tutorial.progress.completionPercent > 0 && (
            <Badge
              variant={tutorial.progress.completionPercent >= 100 ? "default" : "secondary"}
              className="gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              {tutorial.progress.completionPercent}% complete
            </Badge>
          )}
          <Link
            href={
              examId
                ? (`/dashboard/voice-teacher?examId=${examId}&topic=${encodeURIComponent(tutorial.title)}` as "/")
                : ("/dashboard/voice-teacher" as "/")
            }
          >
            <Button variant="outline" size="sm" className="ml-auto gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              Voice Quiz
            </Button>
          </Link>
          <Button
            variant={isComplete ? "outline" : "default"}
            size="sm"
            className="gap-1.5"
            disabled={isComplete || markCompleteMutation.isPending}
            onClick={() =>
              markCompleteMutation.mutate({
                tutorialFileId: tutorial.id,
                syllabusId,
                syllabusNodeId,
              })
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isComplete
              ? "Completed"
              : markCompleteMutation.isPending
                ? "Marking..."
                : "Mark as Complete"}
          </Button>
        </div>
      </header>

      {/* Sections */}
      <div ref={sectionsContainerRef}>
        {tutorial.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            isRead={sectionsReadRef.current.has(section.id)}
            onVisible={handleSectionVisible}
            onHidden={handleSectionHidden}
          />
        ))}
      </div>

      {/* Selection tooltip for Ask AI */}
      <SelectionTooltip containerRef={sectionsContainerRef} onAskAi={setAskAiText} />

      {/* Notes Section */}
      <LearnNotes syllabusNodeId={syllabusNodeId} />

      {/* AI Chat */}
      <LearnChat
        syllabusId={syllabusId}
        syllabusNodeId={syllabusNodeId}
        tutorialFileId={tutorial.id}
        tutorialTitle={tutorial.title}
        onNoteSaved={() => utils.learn.getNotesForNode.invalidate({ syllabusNodeId })}
        prefillMessage={askAiText}
        onPrefillConsumed={() => setAskAiText("")}
        onDockChange={onChatDockChange}
      />
    </article>
  );
}

function SectionBlock({
  section,
  isRead,
  onVisible,
  onHidden,
}: {
  section: TutorialSection;
  isRead: boolean;
  onVisible: (sectionId: string) => void;
  onHidden: (sectionId: string) => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || isRead) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onVisible(section.id);
          } else {
            onHidden(section.id);
          }
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [section.id, isRead, onVisible, onHidden]);

  return (
    <div ref={ref} className="relative" data-section-id={section.id}>
      {isRead && (
        <div className="absolute -left-6 top-2 hidden lg:block">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: section.htmlContent }} />
    </div>
  );
}
