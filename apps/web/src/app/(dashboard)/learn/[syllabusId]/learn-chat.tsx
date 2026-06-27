"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Loader2,
  Bookmark,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Crown,
  PanelRightOpen,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatMessageWithPrompts } from "@/components/chat-message-with-prompts";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type Conversation = {
  id: string;
  messages: ChatMessage[];
  messageCount: number;
  keyword: string | null;
  aiProvider: string | null;
  updatedAt: Date;
};

interface LearnChatProps {
  syllabusId: number;
  syllabusNodeId: number;
  tutorialFileId: number;
  tutorialTitle: string;
  onNoteSaved?: () => void;
  prefillMessage?: string;
  onPrefillConsumed?: () => void;
  onDockChange?: (docked: boolean) => void;
  /**
   * Optional scope preamble prepended to the tutor's system prompt — used by
   * the in-page scoped tutor on the search results page to keep answers on
   * this topic. Additive + backward-compatible; undefined = normal behavior.
   */
  topicScopePreamble?: string;
  /**
   * When this topic has no prior conversation, resume the user's most recent
   * chat from ANY topic (read-only preview) so the box is never empty —
   * mirrors Padvik's persistent assistant. Sending a message then starts a
   * fresh thread scoped to the CURRENT topic. Default off (reader behavior).
   */
  fallbackToLatestConversation?: boolean;
}

export function LearnChat({
  syllabusId,
  syllabusNodeId,
  tutorialFileId,
  tutorialTitle,
  onNoteSaved,
  prefillMessage,
  onPrefillConsumed,
  onDockChange,
  topicScopePreamble,
  fallbackToLatestConversation = false,
}: LearnChatProps): React.ReactElement {
  const { data: session } = useSession();
  const isSubscriber =
    (session?.user as { isSubscriber?: boolean } | undefined)?.isSubscriber ?? false;
  const isAdmin = ["admin", "superadmin"].includes(
    (session?.user as { role?: string } | undefined)?.role ?? "",
  );
  const canUseChat = isSubscriber || isAdmin;

  const [isOpen, setIsOpen] = useState(false);
  const [isDocked, setIsDocked] = useState(false);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState<"claude" | "gemini" | "openai" | "mistral">("claude");
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  // True while showing a resumed last chat from ANOTHER topic (read-only
  // preview). Sending clears it and starts a fresh thread for this topic.
  const [isFallbackPreview, setIsFallbackPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations for the current node (always enabled so data is ready)
  const conversationsQuery = trpc.learn.getConversationsForNode.useQuery(
    { syllabusNodeId },
    { enabled: !!syllabusNodeId, staleTime: 2 * 60 * 1000 },
  );

  // The user's most recent chat across ALL topics — used as a fallback so the
  // box isn't empty when this topic has no conversation yet.
  const latestConversationQuery = trpc.learn.getLatestConversation.useQuery(undefined, {
    enabled: fallbackToLatestConversation && canUseChat,
    staleTime: 2 * 60 * 1000,
  });

  // Reset state when topic changes
  useEffect(() => {
    setActiveConversationId(undefined);
    setLocalMessages([]);
    setShowHistory(false);
    setIsFallbackPreview(false);
  }, [syllabusNodeId]);

  // Auto-load latest conversation when data arrives for the new topic. Prefer
  // this topic's last chat; else fall back to the user's last chat anywhere.
  useEffect(() => {
    if (!conversationsQuery.data || activeConversationId) return;
    if (conversationsQuery.data.length > 0) {
      const latest = conversationsQuery.data[0]!; // ordered by updatedAt DESC
      setActiveConversationId(latest.id);
      setLocalMessages((latest as unknown as Conversation).messages ?? []);
      setIsFallbackPreview(false);
    } else if (
      fallbackToLatestConversation &&
      !isFallbackPreview &&
      latestConversationQuery.data?.messages?.length
    ) {
      // Different-topic last chat — show as a read-only preview. We do NOT set
      // activeConversationId, so the first send starts a fresh thread scoped
      // to the current topic instead of appending to the foreign one.
      setLocalMessages(latestConversationQuery.data.messages as ChatMessage[]);
      setIsFallbackPreview(true);
    }
  }, [
    conversationsQuery.data,
    activeConversationId,
    fallbackToLatestConversation,
    isFallbackPreview,
    latestConversationQuery.data,
  ]);

  // Handle prefill message from text selection
  useEffect(() => {
    if (prefillMessage) {
      setIsOpen(true);
      setMessage(prefillMessage);
      onPrefillConsumed?.();
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [prefillMessage, onPrefillConsumed]);

  // Notify parent about dock changes
  const toggleDock = useCallback(() => {
    const newDocked = !isDocked;
    setIsDocked(newDocked);
    onDockChange?.(newDocked);
  }, [isDocked, onDockChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (isDocked) {
      setIsDocked(false);
      onDockChange?.(false);
    }
  }, [isDocked, onDockChange]);

  const sendMutation = trpc.learn.sendChatMessage.useMutation({
    onSuccess: (data) => {
      setActiveConversationId(data.conversationId);
      setLocalMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          timestamp: new Date().toISOString(),
        },
      ]);
      conversationsQuery.refetch();
    },
    onError: (err) => {
      const errMsg = err.message;
      // Show provider-specific errors inline instead of just a toast
      if (
        errMsg.includes("quota") ||
        errMsg.includes("overloaded") ||
        errMsg.includes("unavailable") ||
        errMsg.includes("provider")
      ) {
        setLocalMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `⚠️ **Error:** ${errMsg}\n\nTip: Try switching to a different AI provider using the dropdown below.`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        toast.error(errMsg);
      }
    },
  });

  const saveNoteMutation = trpc.learn.saveNoteFromChat.useMutation({
    onSuccess: () => {
      toast.success("Note saved!");
      onNoteSaved?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [localMessages, scrollToBottom]);

  const handleSend = useCallback(() => {
    if (!message.trim() || sendMutation.isPending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };
    // If we're showing a resumed chat from another topic, drop that preview and
    // start a clean thread scoped to the current topic on the first send.
    if (isFallbackPreview) {
      setLocalMessages([userMsg]);
      setIsFallbackPreview(false);
    } else {
      setLocalMessages((prev) => [...prev, userMsg]);
    }
    setMessage("");

    sendMutation.mutate({
      syllabusId,
      syllabusNodeId,
      tutorialFileId,
      conversationId: isFallbackPreview ? undefined : activeConversationId,
      message: userMsg.content,
      provider,
      topicScopePreamble,
    });
  }, [
    message,
    sendMutation,
    syllabusId,
    syllabusNodeId,
    tutorialFileId,
    activeConversationId,
    provider,
    topicScopePreamble,
    isFallbackPreview,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const loadConversation = useCallback((conv: Conversation) => {
    setActiveConversationId(conv.id);
    setLocalMessages(conv.messages ?? []);
    setShowHistory(false);
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(undefined);
    setLocalMessages([]);
    setShowHistory(false);
  }, []);

  const handleSaveNote = useCallback(
    (assistantMessage: string, messageIndex: number) => {
      if (!activeConversationId) {
        toast.error("Save a message after starting a conversation");
        return;
      }
      // Find the preceding user message as keyword/question
      let userQuestion: string | undefined;
      for (let i = messageIndex - 1; i >= 0; i--) {
        const msg = localMessages[i];
        if (msg?.role === "user") {
          userQuestion = msg.content.substring(0, 200);
          break;
        }
      }
      saveNoteMutation.mutate({
        conversationId: activeConversationId,
        syllabusId,
        syllabusNodeId,
        tutorialFileId,
        noteContent: assistantMessage,
        keyword: userQuestion,
        isPublic: false,
      });
    },
    [
      activeConversationId,
      syllabusId,
      syllabusNodeId,
      tutorialFileId,
      saveNoteMutation,
      localMessages,
    ],
  );

  if (!canUseChat) {
    return (
      <Link href={"/pricing" as "/"}>
        <Button
          className="fixed bottom-4 right-4 z-40 gap-2 rounded-full shadow-lg"
          size="lg"
          variant="secondary"
        >
          <Crown className="h-5 w-5 text-amber-500" />
          Upgrade for AI Tutor
        </Button>
      </Link>
    );
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 gap-2 rounded-full shadow-lg"
        size="lg"
      >
        <MessageCircle className="h-5 w-5" />
        Ask AI
      </Button>
    );
  }

  // Docked mode: full-height side panel
  // Floating mode: small overlay at bottom-right
  const containerClass = isDocked
    ? "fixed top-14 right-0 z-40 flex h-[calc(100vh-3.5rem)] w-[420px] max-w-[50vw] flex-col border-l bg-background shadow-xl"
    : "fixed bottom-4 right-4 z-40 flex w-[400px] max-w-[calc(100vw-2rem)] flex-col rounded-lg border bg-background shadow-xl";

  const messagesHeight = isDocked ? "flex-1 min-h-0" : "max-h-[350px] min-h-[200px]";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">AI Tutor</span>
          <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
            {tutorialTitle.length > 20 ? tutorialTitle.substring(0, 20) + "..." : tutorialTitle}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            History
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleDock}
            title={isDocked ? "Float chat" : "Dock to side"}
          >
            {isDocked ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
            ×
          </Button>
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="bg-muted/50 max-h-48 overflow-y-auto border-b p-2">
          <Button
            variant="outline"
            size="sm"
            className="mb-2 w-full text-xs"
            onClick={startNewConversation}
          >
            + New Conversation
          </Button>
          {conversationsQuery.data?.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv as unknown as Conversation)}
              className={cn(
                "hover:bg-muted w-full rounded-md px-3 py-2 text-left text-xs transition-colors",
                activeConversationId === conv.id && "bg-primary/10",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">
                  {conv.keyword ?? `Chat (${conv.messageCount} msgs)`}
                </span>
                <span className="text-muted-foreground ml-2 shrink-0">{conv.aiProvider}</span>
              </div>
            </button>
          ))}
          {(!conversationsQuery.data || conversationsQuery.data.length === 0) && (
            <p className="text-muted-foreground py-2 text-center text-xs">
              No previous conversations
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      <div className={cn("overflow-y-auto p-4", messagesHeight)}>
        {isFallbackPreview && localMessages.length > 0 && (
          <div className="bg-muted/50 text-muted-foreground mb-3 rounded-md px-3 py-2 text-xs">
            Resuming your last chat
            {latestConversationQuery.data?.contextTitle
              ? ` on “${latestConversationQuery.data.contextTitle}”`
              : ""}
            . Ask anything to start a new chat on this topic.
          </div>
        )}
        {localMessages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <MessageCircle className="text-muted-foreground mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-muted-foreground text-sm">Ask anything about this topic</p>
              <p className="text-muted-foreground mt-1 text-xs">
                The AI tutor has the full tutorial as context
              </p>
            </div>
          </div>
        )}
        {localMessages.map((msg, i) => (
          <div
            key={i}
            className={cn("mb-3 flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : msg.content.startsWith("⚠️")
                    ? "border-destructive/30 bg-destructive/5 border"
                    : "bg-muted",
              )}
            >
              {msg.role === "assistant" ? (
                <ChatMessageWithPrompts
                  content={msg.content}
                  onPromptClick={(p) => setMessage(p)}
                />
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
              {msg.role === "assistant" && !msg.content.startsWith("⚠️") && (
                <div className="mt-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleSaveNote(msg.content, i)}
                    disabled={saveNoteMutation.isPending}
                    title="Save as note"
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {sendMutation.isPending && (
          <div className="mb-3 flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-2">
          <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="openai">ChatGPT</SelectItem>
              <SelectItem value="mistral">Mistral</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this topic..."
            className="min-h-[40px] resize-none text-sm"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
