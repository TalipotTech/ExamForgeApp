"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  History,
  MessageSquare,
  Coins,
  ArrowLeft,
  Trash2,
  Search,
  Loader2,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "GPT-4o",
  google: "Gemini",
  mistral: "Mistral",
  perplexity: "Perplexity",
  claude: "Claude",
  gemini: "Gemini",
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: "bg-orange-100 text-orange-700 border-orange-200",
  anthropic: "bg-orange-100 text-orange-700 border-orange-200",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-200",
  google: "bg-purple-100 text-purple-700 border-purple-200",
  gemini: "bg-purple-100 text-purple-700 border-purple-200",
  mistral: "bg-blue-100 text-blue-700 border-blue-200",
  perplexity: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export default function AiChatHistoryPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data: stats } = trpc.aiChat.getUsageStats.useQuery();
  const { data: convData, isLoading: convLoading } = trpc.aiChat.listConversations.useQuery({
    limit,
    offset: page * limit,
    search: search || undefined,
  });

  const deleteMutation = trpc.aiChat.deleteConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation deleted");
      utils.aiChat.listConversations.invalidate();
      utils.aiChat.getUsageStats.invalidate();
    },
  });

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const totalPages = convData ? Math.ceil(convData.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/ai-chat">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chat History</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            View your AI conversations and token usage
          </p>
        </div>
      </div>

      {/* Usage Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <MessageSquare className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalConversations}</p>
                <p className="text-muted-foreground text-xs">Total Conversations</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                <Zap className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatTokens(stats.totalTokens)}</p>
                <p className="text-muted-foreground text-xs">
                  Total Tokens ({formatTokens(stats.totalInputTokens)} in /{" "}
                  {formatTokens(stats.totalOutputTokens)} out)
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <Coins className="size-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">${stats.totalCost.toFixed(4)}</p>
                <p className="text-muted-foreground text-xs">Estimated Total Cost</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
                By Provider
              </p>
              <div className="space-y-1.5">
                {stats.providerBreakdown.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No usage yet</p>
                ) : (
                  stats.providerBreakdown.map((p) => (
                    <div key={p.provider} className="flex items-center justify-between text-xs">
                      <Badge
                        variant="outline"
                        className={cn("px-1.5 py-0 text-[10px]", PROVIDER_COLORS[p.provider])}
                      >
                        {PROVIDER_LABELS[p.provider] ?? p.provider}
                      </Badge>
                      <span className="text-muted-foreground">
                        {p.totalCalls} calls · {formatTokens(p.inputTokens + p.outputTokens)} tokens
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Conversations List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              Conversations
            </CardTitle>
            <div className="relative w-64">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {convLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : convData?.conversations.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {search ? "No conversations matching your search" : "No conversations yet"}
            </div>
          ) : (
            <div className="space-y-2">
              {convData?.conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/ai-chat?conversation=${conv.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {conv.title}
                      </Link>
                      <ArrowUpRight className="text-muted-foreground size-3 shrink-0" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {conv.aiProvider && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-1.5 py-0 text-[10px]",
                            PROVIDER_COLORS[conv.aiProvider],
                          )}
                        >
                          {PROVIDER_LABELS[conv.aiProvider] ?? conv.aiProvider}
                        </Badge>
                      )}
                      <span className="text-muted-foreground text-[10px]">
                        {conv.messageCount} messages
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {formatTokens(conv.totalTokens)} tokens
                      </span>
                      {conv.estimatedCostUsd > 0 && (
                        <span className="text-muted-foreground text-[10px]">
                          ${conv.estimatedCostUsd.toFixed(4)}
                        </span>
                      )}
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" title="Delete conversation">
                        <Trash2 className="size-3.5 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this conversation and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate({ conversationId: conv.id })}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-xs">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
