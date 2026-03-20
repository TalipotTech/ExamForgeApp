"use client";

import { Clock, Coins, Cpu, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_PROVIDER_INFO, AI_COST_PER_1K_TOKENS } from "@examforge/shared/constants";

interface CostSummaryProps {
  provider: "anthropic" | "mistral" | "openai" | "google" | "perplexity";
  questionCount: number;
  durationMs: number;
}

export function CostSummary({
  provider,
  questionCount,
  durationMs,
}: CostSummaryProps): React.ReactElement {
  const info = AI_PROVIDER_INFO[provider];
  if (!info) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">Unknown provider</p>
        </CardContent>
      </Card>
    );
  }
  const costs = AI_COST_PER_1K_TOKENS[info.model as keyof typeof AI_COST_PER_1K_TOKENS];
  if (!costs) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">Cost data unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const estimatedOutputTokens = info.avgTokensPerQuestion * questionCount;
  const estimatedInputTokens = 500;
  const estimatedCost =
    (estimatedInputTokens / 1000) * costs.input + (estimatedOutputTokens / 1000) * costs.output;

  const durationSeconds = (durationMs / 1000).toFixed(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4" />
          Generation Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-start gap-2">
            <Cpu className="text-muted-foreground mt-0.5 h-4 w-4" />
            <div>
              <div className="text-muted-foreground text-xs">Model</div>
              <div className="text-sm font-medium">{info.name}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Hash className="text-muted-foreground mt-0.5 h-4 w-4" />
            <div>
              <div className="text-muted-foreground text-xs">Questions</div>
              <div className="text-sm font-medium">{questionCount}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="text-muted-foreground mt-0.5 h-4 w-4" />
            <div>
              <div className="text-muted-foreground text-xs">Duration</div>
              <div className="text-sm font-medium">{durationSeconds}s</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Coins className="text-muted-foreground mt-0.5 h-4 w-4" />
            <div>
              <div className="text-muted-foreground text-xs">Est. Cost</div>
              <div className="text-sm font-medium">${estimatedCost.toFixed(4)}</div>
            </div>
          </div>
        </div>
        <div className="text-muted-foreground mt-3 text-xs">
          ~{estimatedInputTokens + estimatedOutputTokens} tokens estimated (input: ~
          {estimatedInputTokens}, output: ~{estimatedOutputTokens})
        </div>
      </CardContent>
    </Card>
  );
}
