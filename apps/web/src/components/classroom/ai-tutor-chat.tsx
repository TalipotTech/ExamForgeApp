"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Citation = {
  contentId: string;
  contentTitle: string;
  chunkIndex: number;
  snippet: string;
  similarity: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  cached?: boolean;
};

type Props = {
  classroomId: string;
};

export function AiTutorChat({ classroomId }: Props): React.ReactElement {
  const utils = trpc.useUtils();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const conversationsQuery = trpc.aiTutor.listConversations.useQuery({
    classroomId,
    limit: 10,
    offset: 0,
  });

  const loadedConversation = trpc.aiTutor.getConversation.useQuery(
    { conversationId: conversationId ?? "" },
    { enabled: !!conversationId },
  );

  useEffect(() => {
    if (!loadedConversation.data) return;
    setMessages(
      loadedConversation.data.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: (m.citations ?? []) as Citation[],
        cached: m.cached === true,
      })),
    );
  }, [loadedConversation.data]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const askMutation = trpc.aiTutor.ask.useMutation({
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.id === "pending") {
          next[next.length - 1] = {
            id: `tmp-assistant-${Date.now()}`,
            role: "assistant",
            content: data.answer,
            citations: data.citations,
            cached: data.cached,
          };
        } else {
          next.push({
            id: `tmp-assistant-${Date.now()}`,
            role: "assistant",
            content: data.answer,
            citations: data.citations,
            cached: data.cached,
          });
        }
        return next;
      });
      void utils.aiTutor.listConversations.invalidate();
      if (conversationId) {
        void utils.aiTutor.getConversation.invalidate({ conversationId });
      }
    },
    onError: (err) => {
      setMessages((prev) => prev.filter((m) => m.id !== "pending"));
      toast.error(err.message.slice(0, 240));
    },
  });

  const handleSend = useCallback((): void => {
    const text = draft.trim();
    if (!text || askMutation.isPending) return;
    setDraft("");
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-user-${Date.now()}`,
        role: "user",
        content: text,
        citations: [],
      },
      { id: "pending", role: "assistant", content: "", citations: [] },
    ]);
    askMutation.mutate({
      classroomId,
      query: text,
      conversationId: conversationId ?? undefined,
    });
  }, [draft, askMutation, classroomId, conversationId]);

  const handleNewThread = useCallback((): void => {
    setConversationId(null);
    setMessages([]);
  }, []);

  const conversations = conversationsQuery.data?.conversations ?? [];

  const citationLookup = useMemo(() => {
    const allCitations: Citation[] = [];
    for (const m of messages) {
      if (m.role === "assistant") allCitations.push(...m.citations);
    }
    return allCitations;
  }, [messages]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
      <Card className="flex h-[640px] flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" />
            AI Tutor
            <span className="text-muted-foreground text-xs font-normal">
              Grounded in your classroom's content
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleNewThread} disabled={messages.length === 0}>
            New thread
          </Button>
        </div>

        <div
          ref={scrollerRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 ? (
            <div className="text-muted-foreground py-12 text-center text-sm">
              Ask anything about the material your teacher has assigned. Answers
              cite the source content.
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isLoading={m.id === "pending" && askMutation.isPending}
              />
            ))
          )}
        </div>

        <div className="border-t px-3 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the AI tutor… (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="resize-none"
              disabled={askMutation.isPending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!draft.trim() || askMutation.isPending}
              aria-label="Send"
            >
              {askMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="hidden h-[640px] flex-col lg:flex">
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide">
          Recent threads
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {conversationsQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : conversations.length === 0 ? (
            <div className="text-muted-foreground py-6 text-center text-xs">
              No threads yet.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConversationId(c.id)}
                className={`hover:bg-muted block w-full rounded p-2 text-left text-xs ${
                  c.id === conversationId ? "bg-muted" : ""
                }`}
              >
                <div className="line-clamp-2 font-medium">{c.title}</div>
                <div className="text-muted-foreground mt-0.5 flex items-center justify-between">
                  <span>{c.messageCount} msgs</span>
                  <span>
                    {new Date(c.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {citationLookup.length > 0 && (
          <div className="border-t p-2">
            <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
              Cited content
            </div>
            <div className="space-y-1">
              {Array.from(
                new Map(citationLookup.map((c) => [c.contentId, c])).values(),
              )
                .slice(0, 6)
                .map((c) => (
                  <Link
                    key={c.contentId}
                    href={`/dashboard/content/${c.contentId}`}
                    className="hover:bg-muted block rounded px-2 py-1 text-xs"
                  >
                    <FileText className="mr-1 inline size-3" />
                    {c.contentTitle}
                  </Link>
                ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function MessageBubble({
  message,
  isLoading,
}: {
  message: ChatMessage;
  isLoading: boolean;
}): React.ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg rounded-tr-sm px-3 py-2 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="bg-muted max-w-[85%] rounded-lg rounded-tl-sm px-3 py-2 text-sm">
        {isLoading ? (
          <span className="text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </span>
        ) : (
          <>
            <div className="whitespace-pre-wrap">{message.content}</div>
            {message.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {message.citations.map((c, idx) => (
                  <CitationChip key={`${c.contentId}-${c.chunkIndex}`} index={idx + 1} citation={c} />
                ))}
              </div>
            )}
            {message.cached && (
              <div className="text-muted-foreground mt-1 text-[10px] italic">
                Cached answer (no new AI cost)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CitationChip({
  index,
  citation,
}: {
  index: number;
  citation: Citation;
}): React.ReactElement {
  return (
    <Link
      href={`/dashboard/content/${citation.contentId}`}
      title={`${citation.contentTitle} — ${citation.snippet}`}
    >
      <Badge variant="outline" className="cursor-pointer text-[10px] hover:bg-accent">
        [{index}] {citation.contentTitle.length > 32 ? `${citation.contentTitle.slice(0, 30)}…` : citation.contentTitle}
      </Badge>
    </Link>
  );
}
