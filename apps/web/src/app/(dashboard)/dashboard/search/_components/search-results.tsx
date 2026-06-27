"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Loader2,
  Search as SearchIcon,
  BookOpen,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
  History,
} from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { TopicSearchBox } from "@/components/search/topic-search-box";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LearnChat } from "@/app/(dashboard)/learn/[syllabusId]/learn-chat";
import { cn } from "@/lib/utils";

const TRUST: Record<string, { label: string; dot: string }> = {
  real_paper: { label: "Real paper", dot: "bg-green-500" },
  textbook: { label: "Textbook", dot: "bg-blue-500" },
  pattern_ai: { label: "Verified AI", dot: "bg-yellow-500" },
  topic_ai: { label: "Topic AI", dot: "bg-orange-500" },
  supplementary_ai: { label: "Supplementary", dot: "bg-gray-400" },
};

interface SearchResultsProps {
  initialQuery: string;
  initialNodeId: number | null;
}

export function SearchResults({
  initialQuery,
  initialNodeId,
}: SearchResultsProps): React.ReactElement {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [landingNodeId, setLandingNodeId] = useState<number | null>(initialNodeId);
  const [rejected, setRejected] = useState<{ reason: string } | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const searchedAt = useMemo(() => new Date(), []);
  const startRef = useRef(0);
  const firedFor = useRef<string | null>(null);

  // Restore last search when landing with no query.
  useEffect(() => {
    if (initialQuery.trim().length === 0) {
      try {
        const raw = sessionStorage.getItem("examforge:lastSearch");
        if (raw) {
          const last = JSON.parse(raw) as { q?: string; nodeId?: number };
          if (last.q) {
            const qs = `q=${encodeURIComponent(last.q)}${last.nodeId ? `&nodeId=${last.nodeId}` : ""}`;
            router.replace(`/dashboard/search?${qs}` as "/");
          }
        }
      } catch {
        /* ignore */
      }
    }
  }, [initialQuery, router]);

  const searchMutation = trpc.topicSearch.search.useMutation({
    onSuccess: (data) => {
      setDurationMs(Math.max(1, Math.round(performance.now() - startRef.current)));
      if (data.rejected) {
        setRejected({ reason: data.reason ?? "That doesn't look like a syllabus topic." });
        setLandingNodeId(null);
      } else {
        setRejected(null);
        if (data.landingNodeId !== null) setLandingNodeId(data.landingNodeId);
      }
      // Recently-searched is written server-side during search — refetch so it
      // appears instantly.
      utils.topicSearch.history.invalidate();
    },
    onError: () => {
      setDurationMs(Math.max(1, Math.round(performance.now() - startRef.current)));
    },
  });

  // Fire the search once per distinct query (logs history + tracks demand,
  // resolves landing node / rejection).
  useEffect(() => {
    const q = initialQuery.trim();
    if (q.length < 2) return;
    if (firedFor.current === q) return;
    firedFor.current = q;
    startRef.current = performance.now();
    searchMutation.mutate({ q });
  }, [initialQuery, searchMutation]);

  const bundleQuery = trpc.topicSearch.bundle.useQuery(
    { nodeId: landingNodeId ?? 0 },
    { enabled: landingNodeId !== null, staleTime: 60 * 1000 },
  );
  const bundle = bundleQuery.data;

  const historyQuery = trpc.topicSearch.history.useQuery({ limit: 8 }, { staleTime: 0 });

  const isSearching = searchMutation.isPending && durationMs === null;

  return (
    <div className="space-y-6">
      {/* Search box */}
      <TopicSearchBox initialQuery={initialQuery} autoFocus={initialQuery.length === 0} />

      {/* Heading card — rendered immediately, not gated on the response */}
      <Card>
        <CardContent className="flex flex-col gap-1 py-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Search results for
          </p>
          <h1 className="text-xl font-bold">{initialQuery || "—"}</h1>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="size-3" />
            Searched {searchedAt.toLocaleDateString()} {searchedAt.toLocaleTimeString()}
            {" · "}
            {isSearching ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> searching…
              </span>
            ) : durationMs !== null ? (
              <span>found in {durationMs} ms</span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="space-y-6">
          {rejected ? (
            <Card>
              <CardContent className="flex items-start gap-3 py-5">
                <Info className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">ExamForge search is for your exam syllabus.</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Try a topic like &ldquo;pharmacokinetics&rdquo; or &ldquo;Ohm&apos;s law&rdquo;.
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs italic">{rejected.reason}</p>
                </div>
              </CardContent>
            </Card>
          ) : landingNodeId === null && !isSearching ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center text-sm">
                <SearchIcon className="mx-auto mb-2 size-6 opacity-50" />
                No matching topic yet. Try a different phrasing.
              </CardContent>
            </Card>
          ) : bundleQuery.isLoading || (landingNodeId !== null && !bundle) ? (
            <Card>
              <CardContent className="space-y-3 py-5">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ) : bundle ? (
            <LandingNode bundle={bundle} />
          ) : null}
        </div>

        {/* Right rail — recently searched */}
        <aside className="space-y-3">
          <div className="flex items-center gap-1.5">
            <History className="size-4" />
            <h2 className="text-sm font-semibold">Recently searched</h2>
          </div>
          {historyQuery.data && historyQuery.data.length > 0 ? (
            <div className="flex flex-col gap-1">
              {historyQuery.data.map((h, i) => (
                <button
                  key={`${h.query}-${i}`}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/dashboard/search?q=${encodeURIComponent(h.nodeTitle ?? h.query)}${h.nodeId ? `&nodeId=${h.nodeId}` : ""}` as "/",
                    )
                  }
                  className="hover:bg-accent/50 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
                  title={h.nodeTitle ?? h.query}
                >
                  {h.nodeTitle ?? h.query}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">Your recent searches show up here.</p>
          )}
        </aside>
      </div>

      {/* In-page scoped tutor (reuses LearnChat) — only when a tutorial exists */}
      {bundle?.tutorial && landingNodeId !== null && (
        <LearnChat
          syllabusId={bundle.tutorial.syllabusId}
          syllabusNodeId={landingNodeId}
          tutorialFileId={bundle.tutorial.id}
          tutorialTitle={bundle.node.title}
          fallbackToLatestConversation
          topicScopePreamble={`You are tutoring on "${bundle.node.title}" (${bundle.node.subject}${bundle.node.examName ? `, ${bundle.node.examName}` : ""}). Answer about THIS topic and its syllabus only; politely decline unrelated asks.`}
        />
      )}
    </div>
  );
}

type Bundle = NonNullable<RouterOutputs["topicSearch"]["bundle"]>;

function LandingNode({ bundle }: { bundle: Bundle }): React.ReactElement {
  const router = useRouter();
  const [tutorialOpen, setTutorialOpen] = useState(true);

  return (
    <div className="space-y-6">
      {/* Node header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{bundle.node.title}</h2>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
            {bundle.node.subject && <Badge variant="secondary">{bundle.node.subject}</Badge>}
            {bundle.node.path && <span className="truncate">{bundle.node.path}</span>}
            {bundle.node.examName && <span>· {bundle.node.examName}</span>}
          </div>
        </div>
        {bundle.node.syllabusId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              router.push(`/learn/${bundle.node.syllabusId}?node=${bundle.node.id}` as "/")
            }
          >
            <ExternalLink className="size-3.5" />
            Open in Learn
          </Button>
        )}
      </div>

      {/* Tutorial inline (collapsible) */}
      {bundle.tutorial ? (
        <Card>
          <CardContent className="py-4">
            <button
              type="button"
              onClick={() => setTutorialOpen((o) => !o)}
              className="flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4" />
                Tutorial
                {bundle.tutorial.estimatedReadMinutes ? (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Clock className="size-3" />
                    {bundle.tutorial.estimatedReadMinutes} min
                  </Badge>
                ) : null}
              </span>
              {tutorialOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {tutorialOpen && (
              <div className="mt-4 space-y-5">
                {bundle.tutorial.sections.map((s) => (
                  <section key={s.id}>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: s.htmlContent }}
                    />
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : bundle.childTopics.length > 0 ? (
        // Container node (e.g. a module) with no tutorial of its own — list the
        // sub-topics that DO have content so the user can drill in.
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="size-4" />
              Topics in this module
            </h3>
            <div className="space-y-1">
              {bundle.childTopics.map((t) => (
                <button
                  key={t.nodeId}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/dashboard/search?q=${encodeURIComponent(t.title)}&nodeId=${t.nodeId}` as "/",
                    )
                  }
                  className="hover:bg-accent/50 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                >
                  <span className="truncate">{t.title}</span>
                  {t.path && (
                    <span className="text-muted-foreground ml-2 hidden truncate text-xs sm:inline">
                      {t.path}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-5 text-sm">
            No tutorial published for this topic yet. We&apos;ve noted the demand — content is
            generated for high-demand topics.
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {bundle.questions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Practice questions</h3>
          <div className="space-y-2">
            {bundle.questions.map((q) => {
              const trust = q.trustTier ? TRUST[q.trustTier] : undefined;
              return (
                <Card key={q.id}>
                  <CardContent className="flex items-start gap-3 py-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        trust?.dot ?? "bg-gray-300",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm">
                        {q.stem || <span className="text-muted-foreground italic">Question</span>}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {q.difficulty}
                        </Badge>
                        {trust && (
                          <span className="text-muted-foreground text-[10px]">{trust.label}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Related topics */}
      {bundle.related.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Related topics</h3>
          <div className="flex flex-wrap gap-2">
            {bundle.related.map((r) => (
              <button
                key={r.nodeId}
                type="button"
                onClick={() =>
                  router.push(
                    `/dashboard/search?q=${encodeURIComponent(r.title)}&nodeId=${r.nodeId}` as "/",
                  )
                }
                className="border-border hover:bg-accent/50 rounded-full border px-3 py-1 text-xs transition-colors"
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
