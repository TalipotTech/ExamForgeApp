"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatMessageWithPrompts } from "@/components/chat-message-with-prompts";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Plus,
  Loader2,
  Trash2,
  History,
  Search,
  Bot,
  User,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Provider = "claude" | "gemini" | "openai" | "mistral" | "perplexity";
type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };

const PROVIDER_OPTIONS: { id: Provider; label: string; color: string }[] = [
  { id: "claude", label: "Claude", color: "text-orange-600" },
  { id: "openai", label: "GPT-4o", color: "text-emerald-600" },
  { id: "gemini", label: "Gemini", color: "text-purple-600" },
  { id: "mistral", label: "Mistral", color: "text-blue-600" },
  { id: "perplexity", label: "Perplexity", color: "text-cyan-600" },
];

const STARTER_PROMPTS = [
  "Explain the difference between NEET and GPAT exam patterns",
  "Help me create a study plan for UPSC Prelims",
  "What are the most important topics in Pharmacology?",
  "Quiz me on Organic Chemistry basics",
];

const PROVIDER_BADGE_COLORS: Record<string, string> = {
  claude: "bg-orange-100 text-orange-700 border-orange-200",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-200",
  gemini: "bg-purple-100 text-purple-700 border-purple-200",
  mistral: "bg-blue-100 text-blue-700 border-blue-200",
  perplexity: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

function AiChatPageInner(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get("conversation");

  const [conversationId, setConversationId] = useState<string | null>(conversationParam);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [provider, setProvider] = useState<Provider>("claude");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();

  // List conversations for sidebar
  const { data: convList } = trpc.aiChat.listConversations.useQuery(
    { limit: 30, search: sidebarSearch || undefined },
    { staleTime: 30_000 },
  );

  // Load selected conversation
  const { data: loadedConv } = trpc.aiChat.getConversation.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  // Sync loaded conversation into local state
  useEffect(() => {
    if (loadedConv) {
      setMessages((loadedConv.messages ?? []) as ChatMessage[]);
    }
  }, [loadedConv]);

  // Send message mutation
  const sendMutation = trpc.aiChat.sendMessage.useMutation({
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          timestamp: new Date().toISOString(),
        },
      ]);
      router.replace(`/dashboard/ai-chat?conversation=${data.conversationId}`, { scroll: false });
      utils.aiChat.listConversations.invalidate();
    },
    onError: (err) => {
      // Remove optimistic user message
      setMessages((prev) => prev.slice(0, -1));
      toast.error(`Failed: ${err.message.slice(0, 200)}`);
    },
  });

  const deleteMutation = trpc.aiChat.deleteConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation deleted");
      handleNewChat();
      utils.aiChat.listConversations.invalidate();
    },
  });

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    (text?: string): void => {
      const msg = (text ?? inputValue).trim();
      if (!msg || sendMutation.isPending) return;

      // Optimistic: add user message immediately
      setMessages((prev) => [
        ...prev,
        { role: "user", content: msg, timestamp: new Date().toISOString() },
      ]);
      setInputValue("");

      sendMutation.mutate({
        conversationId: conversationId ?? undefined,
        message: msg,
        provider,
      });
    },
    [inputValue, conversationId, provider, sendMutation],
  );

  const handleNewChat = useCallback((): void => {
    setConversationId(null);
    setMessages([]);
    setInputValue("");
    router.replace("/dashboard/ai-chat", { scroll: false });
  }, [router]);

  const handleSelectConversation = useCallback(
    (id: string): void => {
      setConversationId(id);
      router.replace(`/dashboard/ai-chat?conversation=${id}`, { scroll: false });
    },
    [router],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (prompt: string): void => {
    handleSend(prompt);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-lg border">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="bg-muted/30 flex w-72 shrink-0 flex-col border-r">
          <div className="flex items-center gap-2 border-b p-3">
            <Button variant="default" size="sm" className="flex-1 gap-1" onClick={handleNewChat}>
              <Plus className="size-4" />
              New Chat
            </Button>
            <Link href="/dashboard/ai-chat/history">
              <Button variant="ghost" size="icon-sm" title="Chat History">
                <History className="size-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>

          <div className="p-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                placeholder="Search chats..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {convList?.conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={cn(
                  "mb-0.5 flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  conv.id === conversationId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50 text-muted-foreground",
                )}
              >
                <span className="w-full truncate text-xs font-medium">{conv.title}</span>
                <div className="flex items-center gap-1.5">
                  {conv.aiProvider && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1 py-0 text-[9px]",
                        PROVIDER_BADGE_COLORS[conv.aiProvider] ?? "",
                      )}
                    >
                      {conv.aiProvider}
                    </Badge>
                  )}
                  <span className="text-[10px] opacity-60">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
            {convList?.conversations.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-xs">No conversations yet</p>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Chat Header */}
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
          <MessageSquare className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {loadedConv?.title ?? "New Conversation"}
          </span>
          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className={p.color}>{p.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {conversationId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => deleteMutation.mutate({ conversationId })}
              disabled={deleteMutation.isPending}
              title="Delete conversation"
            >
              <Trash2 className="size-4 text-red-500" />
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !sendMutation.isPending ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="text-center">
                <Bot className="text-muted-foreground mx-auto mb-3 size-12" />
                <h2 className="text-lg font-semibold">AI Study Assistant</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Ask me anything about exam preparation, subjects, or study strategies.
                </p>
              </div>
              <div className="grid max-w-lg gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="hover:bg-accent rounded-lg border p-3 text-left text-sm transition-colors"
                  >
                    <Sparkles className="mb-1 size-3.5 text-amber-500" />
                    <span className="text-muted-foreground">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="mt-1 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-1.5">
                      <Bot className="size-3.5 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-4 py-3",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border",
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <ChatMessageWithPrompts
                        content={msg.content}
                        onPromptClick={handlePromptClick}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="bg-muted mt-1 shrink-0 rounded-full p-1.5">
                      <User className="size-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {sendMutation.isPending && (
                <div className="flex gap-3">
                  <div className="shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-1.5">
                    <Bot className="size-3.5 text-white" />
                  </div>
                  <div className="bg-card flex items-center gap-2 rounded-lg border px-4 py-3">
                    <Loader2 className="text-muted-foreground size-4 animate-spin" />
                    <span className="text-muted-foreground text-sm">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-background border-t p-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Textarea
              ref={textareaRef}
              placeholder="Ask anything about exam preparation..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="max-h-[120px] min-h-[40px] resize-none"
              disabled={sendMutation.isPending}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || sendMutation.isPending}
              className="shrink-0"
            >
              {sendMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AiChatPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <AiChatPageInner />
    </Suspense>
  );
}
