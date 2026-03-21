"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { LearnSidebar } from "./learn-sidebar";
import { LearnContent } from "./learn-content";
import { LearnSearch } from "./learn-search";
import { LearnNavigation } from "./learn-navigation";
import { LearnProgressBar } from "./learn-progress-bar";
import { GenerateExamDialog } from "./generate-exam-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, BookOpen } from "lucide-react";
import { ScrollButtons } from "@/components/scroll-buttons";
import "@/styles/tutorial-content.css";

export default function LearnSyllabusPage(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const syllabusId = Number(params.syllabusId);
  const activeNodeId = searchParams.get("node") ? Number(searchParams.get("node")) : null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatDocked, setChatDocked] = useState(false);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [examDialogNodeIds, setExamDialogNodeIds] = useState<number[]>([]);

  const handleGenerateExam = useCallback((nodeIds: number[]) => {
    setExamDialogNodeIds(nodeIds);
    setExamDialogOpen(true);
  }, []);

  const mainRef = useRef<HTMLDivElement>(null);

  // Queries
  const treeQuery = trpc.learn.getSyllabusLearningTree.useQuery(
    { syllabusId },
    { staleTime: 5 * 60 * 1000 },
  );

  const navQuery = trpc.learn.getNavigationOrder.useQuery(
    { syllabusId },
    { staleTime: 5 * 60 * 1000 },
  );

  // Find first node with tutorial if none selected
  const firstNodeId = useMemo(() => {
    if (!navQuery.data) return null;
    const first = navQuery.data.find((n) => n.hasTutorial);
    return first?.id ?? null;
  }, [navQuery.data]);

  // Auto-select first node
  const effectiveNodeId = activeNodeId ?? firstNodeId;

  const contentQuery = trpc.learn.getTutorialContent.useQuery(
    { syllabusNodeId: effectiveNodeId! },
    { enabled: !!effectiveNodeId, staleTime: 10 * 60 * 1000 },
  );

  const handleSelectNode = useCallback(
    (nodeId: number) => {
      router.push(`/learn/${syllabusId}?node=${nodeId}`, { scroll: false });
      setMobileOpen(false);
    },
    [router, syllabusId],
  );

  // Navigation helpers
  const navInfo = useMemo(() => {
    if (!navQuery.data || !effectiveNodeId) return null;
    const idx = navQuery.data.findIndex((n) => n.id === effectiveNodeId);
    if (idx === -1) return null;
    const prev = idx > 0 ? navQuery.data[idx - 1] : null;
    const next = idx < navQuery.data.length - 1 ? navQuery.data[idx + 1] : null;
    return {
      prevNode: prev && prev.hasTutorial ? prev : null,
      nextNode: next && next.hasTutorial ? next : null,
      currentIndex: idx,
      total: navQuery.data.length,
    };
  }, [navQuery.data, effectiveNodeId]);

  if (treeQuery.isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-muted-foreground">Loading syllabus...</div>
      </div>
    );
  }

  if (!treeQuery.data) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-muted-foreground">Syllabus not found.</div>
      </div>
    );
  }

  const { syllabus, nodes, stats } = treeQuery.data;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">{syllabus.title}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{syllabus.examName}</p>
        <LearnProgressBar stats={stats} className="mt-3" />
      </div>
      <div className="p-2">
        <LearnSearch syllabusId={syllabusId} onSelectNode={handleSelectNode} />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <LearnSidebar
          nodes={nodes}
          activeNodeId={effectiveNodeId}
          onSelectNode={handleSelectNode}
          onGenerateExam={handleGenerateExam}
        />
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-[300px] shrink-0 overflow-hidden border-r lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed bottom-4 left-4 z-50 rounded-full shadow-lg lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Table of Contents</SheetTitle>
          </SheetHeader>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Content area */}
      <main
        ref={mainRef}
        className={`flex-1 overflow-y-auto transition-[margin] duration-300 ${chatDocked ? "mr-[420px]" : ""}`}
      >
        {effectiveNodeId && contentQuery.data ? (
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
            <LearnContent
              tutorial={contentQuery.data}
              syllabusId={syllabusId}
              syllabusNodeId={effectiveNodeId}
              onChatDockChange={setChatDocked}
            />
            {navInfo && (
              <LearnNavigation
                prevNode={navInfo.prevNode}
                nextNode={navInfo.nextNode}
                onNavigate={handleSelectNode}
              />
            )}
          </div>
        ) : effectiveNodeId && contentQuery.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-muted-foreground">Loading tutorial...</div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <BookOpen className="text-muted-foreground h-16 w-16" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Select a topic</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose a topic from the sidebar to start learning
              </p>
            </div>
          </div>
        )}
        <ScrollButtons containerRef={mainRef} />
      </main>

      {/* Generate Exam Dialog */}
      <GenerateExamDialog
        open={examDialogOpen}
        onOpenChange={setExamDialogOpen}
        syllabusId={syllabusId}
        selectedNodeIds={examDialogNodeIds}
        mode={examDialogNodeIds.length > 1 ? "multi-topic" : "single-topic"}
        tutorialFileId={contentQuery.data?.id}
      />
    </div>
  );
}
