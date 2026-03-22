"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessageWithPrompts } from "@/components/chat-message-with-prompts";
import { useAiChatPopupStore } from "@/stores/ai-chat-popup-store";
import {
  X,
  Maximize2,
  Send,
  Loader2,
  Bot,
  User,
  MessageSquare,
  History,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";

type ChatView = "chat" | "history";

const AI_PROVIDERS = ["claude", "gemini", "openai", "mistral"] as const;
type AiProvider = (typeof AI_PROVIDERS)[number];

const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "GPT-4o",
  mistral: "Mistral",
};

const PROVIDER_COLORS: Record<AiProvider, string> = {
  claude: "text-orange-600 dark:text-orange-400",
  gemini: "text-blue-600 dark:text-blue-400",
  openai: "text-green-600 dark:text-green-400",
  mistral: "text-indigo-600 dark:text-indigo-400",
};

interface AiChatPopupProps {
  pageContext?: string;
}

export function AiChatPopup({ pageContext }: AiChatPopupProps): React.ReactElement | null {
  const router = useRouter();
  const isOpen = useAiChatPopupStore((s) => s.isOpen);
  const conversationId = useAiChatPopupStore((s) => s.conversationId);
  const messages = useAiChatPopupStore((s) => s.messages);
  const closePopup = useAiChatPopupStore((s) => s.closePopup);
  const setConversationId = useAiChatPopupStore((s) => s.setConversationId);
  const addMessage = useAiChatPopupStore((s) => s.addMessage);
  const setMessages = useAiChatPopupStore((s) => s.setMessages);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<AiProvider>("claude");
  const [activeProvider, setActiveProvider] = useState<AiProvider | null>(null);
  const [view, setView] = useState<ChatView>("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trpcUtils = trpc.useUtils();
  const sendMutation = trpc.aiChat.sendMessage.useMutation();
  const deleteMutation = trpc.aiChat.deleteConversation.useMutation();

  // Fetch conversation history for this page context
  const historyQuery = trpc.aiChat.listConversations.useQuery(
    { limit: 20, pageContext: pageContext },
    { enabled: !!pageContext, staleTime: 0 },
  );

  // Clear store and auto-load latest conversation when pageContext changes (on mount)
  const hasAutoLoaded = useRef(false);
  const currentPageContext = useRef(pageContext);

  // On mount (or pageContext change via key), immediately clear stale state
  useEffect(() => {
    hasAutoLoaded.current = false;
    currentPageContext.current = pageContext;
    // Clear any state from previous page context
    setConversationId(null);
    setMessages([]);
  }, [pageContext]);

  // Once history data loads, auto-load the most recent conversation
  useEffect(() => {
    if (hasAutoLoaded.current) return;
    if (!pageContext || pageContext !== currentPageContext.current) return;
    if (historyQuery.isLoading) return;

    hasAutoLoaded.current = true;

    const conversations = historyQuery.data?.conversations;
    if (!conversations?.length) return;

    const latest = conversations[0];
    if (!latest) return;

    trpcUtils.aiChat.getConversation
      .fetch({ conversationId: latest.id })
      .then((conv) => {
        // Double-check we haven't navigated away
        if (currentPageContext.current !== pageContext) return;
        const msgs = (conv.messages as { role: "user" | "assistant"; content: string }[]).map(
          (m) => ({ role: m.role, content: m.content }),
        );
        setConversationId(latest.id);
        setMessages(msgs);
      })
      .catch(() => {
        // silently fail
      });
  }, [
    pageContext,
    historyQuery.data,
    historyQuery.isLoading,
    setConversationId,
    setMessages,
    trpcUtils,
  ]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when popup opens
  useEffect(() => {
    if (isOpen && view === "chat") {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  // Listen for prefill from text selection
  useEffect(() => {
    function handlePrefill(e: Event): void {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        setView("chat");
        handleSend(detail);
      }
    }
    window.addEventListener("ai-chat-prefill", handlePrefill);
    return (): void => {
      window.removeEventListener("ai-chat-prefill", handlePrefill);
    };
  }, [conversationId, isSending]);

  async function handleSend(messageText?: string): Promise<void> {
    const text = messageText ?? input.trim();
    if (!text || isSending) return;

    addMessage({ role: "user", content: text });
    if (!messageText) setInput("");
    setIsSending(true);

    // Build fallback order: current provider first, then the rest
    const fallbackOrder = [currentProvider, ...AI_PROVIDERS.filter((p) => p !== currentProvider)];

    let lastError = "";
    for (const provider of fallbackOrder) {
      setActiveProvider(provider);
      try {
        const result = await sendMutation.mutateAsync({
          message: text,
          provider,
          conversationId: conversationId ?? undefined,
          pageContext: pageContext,
        });

        if (result.conversationId && !conversationId) {
          setConversationId(result.conversationId);
          historyQuery.refetch();
        }

        // Update the current provider to whichever succeeded
        setCurrentProvider(provider);
        addMessage({ role: "assistant", content: result.response });
        setActiveProvider(null);
        setIsSending(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error";
        // Continue to next provider
      }
    }

    // All providers failed
    setActiveProvider(null);
    addMessage({
      role: "assistant",
      content: `Sorry, all AI providers failed. Last error: ${lastError}. Please try again later.`,
    });
    setIsSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleExpand(): void {
    if (conversationId) {
      router.push(`/dashboard/ai-chat?conversation=${conversationId}` as "/");
    } else {
      router.push("/dashboard/ai-chat" as "/");
    }
    closePopup();
  }

  function handleSuggestionClick(suggestion: string): void {
    handleSend(suggestion);
  }

  function handleNewChat(): void {
    hasAutoLoaded.current = true; // prevent auto-load from re-triggering
    setConversationId(null);
    setMessages([]);
    useAiChatPopupStore.getState().openPopup();
    setView("chat");
  }

  async function handleLoadConversation(convId: string): Promise<void> {
    setView("chat");
    setConversationId(convId);

    // Load the conversation messages
    try {
      const conv = await trpcUtils.aiChat.getConversation.fetch({ conversationId: convId });
      const msgs = (conv.messages as { role: "user" | "assistant"; content: string }[]).map(
        (m) => ({ role: m.role, content: m.content }),
      );
      setMessages(msgs);
    } catch {
      // If loading fails, start fresh
      handleNewChat();
    }
  }

  async function handleDeleteConversation(e: React.MouseEvent, convId: string): Promise<void> {
    e.stopPropagation();
    await deleteMutation.mutateAsync({ conversationId: convId });
    historyQuery.refetch();
    // If deleting the active conversation, start fresh
    if (convId === conversationId) {
      handleNewChat();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      data-ai-chat-popup
      className="fixed bottom-20 right-6 z-50 flex w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-white shadow-2xl sm:bottom-20 dark:bg-zinc-950"
    >
      {/* Header */}
      <div className="bg-primary/5 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="text-primary h-4 w-4" />
          <span className="text-sm font-semibold">Ask AI</span>
        </div>
        <div className="flex items-center gap-1">
          {pageContext && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setView(view === "history" ? "chat" : "history")}
              title={view === "history" ? "Back to chat" : "Chat history"}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          )}
          {view === "chat" && messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleNewChat}
              title="New chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleExpand}
            title="Open full screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={closePopup}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {view === "history" ? (
        /* History View */
        <div className="overflow-y-auto p-3" style={{ maxHeight: "50vh" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">Recent conversations</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={handleNewChat}
            >
              <Plus className="h-3 w-3" />
              New Chat
            </Button>
          </div>

          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : !historyQuery.data?.conversations.length ? (
            <div className="py-8 text-center">
              <History className="text-muted-foreground/30 mx-auto h-8 w-8" />
              <p className="text-muted-foreground mt-2 text-xs">
                No conversations yet on this page
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {historyQuery.data.conversations.map((conv) => (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  className={`hover:bg-muted group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    conv.id === conversationId ? "bg-primary/5 border-primary/20 border" : ""
                  }`}
                  onClick={() => handleLoadConversation(conv.id)}
                  onKeyDown={(e) => e.key === "Enter" && handleLoadConversation(conv.id)}
                >
                  <Bot className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{conv.title}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {conv.messageCount} messages ·{" "}
                      {new Date(conv.updatedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Chat View */
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3" style={{ maxHeight: "50vh" }}>
            {messages.length === 0 && !isSending && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bot className="text-muted-foreground/30 h-10 w-10" />
                <p className="text-muted-foreground mt-2 text-sm">Ask anything about your notes</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Select text on the page and paste it here, or type your question
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="flex gap-2">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "assistant"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-3.5 w-3.5" />
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {msg.role === "assistant" ? (
                    <div className="prose prose-xs dark:prose-invert max-w-none text-sm">
                      <ChatMessageWithPrompts
                        content={msg.content}
                        onPromptClick={handleSuggestionClick}
                      />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content.length > 300
                        ? msg.content.substring(0, 300) + "..."
                        : msg.content}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex gap-2">
                <div className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
                  <span className="text-muted-foreground text-xs">
                    Asking{" "}
                    <span
                      className={`font-medium ${activeProvider ? PROVIDER_COLORS[activeProvider] : ""}`}
                    >
                      {activeProvider ? PROVIDER_LABELS[activeProvider] : "AI"}
                    </span>
                    ...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3">
            {/* Provider selector */}
            <div className="mb-2 flex items-center gap-1">
              <Sparkles className="text-muted-foreground h-3 w-3" />
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentProvider(p)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    currentProvider === p
                      ? `${PROVIDER_COLORS[p]} bg-muted ring-current/20 ring-1`
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question..."
                className="min-h-[38px] resize-none text-sm"
                rows={1}
                disabled={isSending}
              />
              <Button
                size="sm"
                className="h-[38px] w-[38px] shrink-0 p-0"
                disabled={!input.trim() || isSending}
                onClick={() => handleSend()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
