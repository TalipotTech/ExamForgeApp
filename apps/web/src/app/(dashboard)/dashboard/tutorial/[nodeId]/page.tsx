"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileQuestion, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRef, useEffect, useState } from "react";

export default function HtmlTutorialViewerPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const nodeId = Number(params.nodeId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800);

  const tutorialQuery = trpc.tutorialAgent.getTutorialForNode.useQuery(
    { syllabusNodeId: nodeId },
    { enabled: !isNaN(nodeId) },
  );

  const generateExamMutation = trpc.tutorialAgent.generateUserExam.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.questionCount} practice questions!`);
      router.push(`/dashboard/my-exams`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Adjust iframe height based on content
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = (): void => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          setIframeHeight(body.scrollHeight + 40);
        }
      } catch {
        // Cross-origin — use default height
      }
    };

    iframe.addEventListener("load", handleLoad);
    return (): void => iframe.removeEventListener("load", handleLoad);
  }, [tutorialQuery.data]);

  if (tutorialQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!tutorialQuery.data) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            No HTML tutorial generated for this topic yet.
            <br />
            <Button variant="link" onClick={() => router.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { html, isPreview, isLocked, meta } = tutorialQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{meta.title}</h1>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              {meta.estimatedReadMinutes && <span>{meta.estimatedReadMinutes} min read</span>}
              {meta.wordCount && <span>·</span>}
              {meta.wordCount && <span>{meta.wordCount.toLocaleString()} words</span>}
              {meta.sectionsCount && <span>·</span>}
              {meta.sectionsCount && <span>{meta.sectionsCount} sections</span>}
              <Badge variant="outline">v{meta.version}</Badge>
            </div>
          </div>
        </div>

        {/* Generate Exam button */}
        {!isLocked && (
          <Button
            variant="outline"
            onClick={() =>
              generateExamMutation.mutate({
                syllabusNodeId: nodeId,
                tutorialFileId: meta.id,
                questionCount: 10,
                difficulty: "mixed",
                providers: ["claude"],
              })
            }
            disabled={generateExamMutation.isPending}
          >
            {generateExamMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileQuestion className="mr-2 h-4 w-4" />
            )}
            Generate Practice Exam
          </Button>
        )}
      </div>

      {/* Preview indicator */}
      {isPreview && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Lock className="h-4 w-4" />
          You are viewing a preview. Upgrade to read the full tutorial.
        </div>
      )}

      {/* Tutorial HTML rendered in iframe */}
      <div className="overflow-hidden rounded-lg border">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          className="w-full border-0"
          style={{ height: `${iframeHeight}px` }}
          sandbox="allow-scripts allow-same-origin"
          title={meta.title}
        />
      </div>
    </div>
  );
}
