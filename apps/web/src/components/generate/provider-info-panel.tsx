"use client";

import { Info, DollarSign, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AI_PROVIDER_INFO,
  AI_COST_PER_1K_TOKENS,
} from "@examforge/shared/constants";

interface ProviderInfoPanelProps {
  provider: "anthropic" | "mistral";
  count: number;
}

function estimateCost(
  provider: "anthropic" | "mistral",
  count: number,
): { inputCost: number; outputCost: number; total: number } {
  const info = AI_PROVIDER_INFO[provider];
  const costs = AI_COST_PER_1K_TOKENS[info.model];

  const estimatedInputTokens = 500;
  const estimatedOutputTokens = info.avgTokensPerQuestion * count;

  const inputCost = (estimatedInputTokens / 1000) * costs.input;
  const outputCost = (estimatedOutputTokens / 1000) * costs.output;

  return {
    inputCost,
    outputCost,
    total: inputCost + outputCost,
  };
}

export function ProviderInfoPanel({
  provider,
  count,
}: ProviderInfoPanelProps): React.ReactElement {
  const info = AI_PROVIDER_INFO[provider];
  const cost = estimateCost(provider, count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          Provider Info
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm font-medium">{info.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Model: <code className="text-xs">{info.model}</code>
          </div>
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1.5">
            {info.description}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Strengths
          </div>
          <div className="flex flex-wrap gap-1.5">
            {info.strengths.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                <CheckCircle className="mr-1 h-3 w-3" />
                {s}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            <DollarSign className="h-3 w-3" />
            Estimated Cost
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input tokens</span>
              <span>${cost.inputCost.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Output (~{count * AI_PROVIDER_INFO[provider].avgTokensPerQuestion} tokens)
              </span>
              <span>${cost.outputCost.toFixed(4)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total estimate</span>
              <span>${cost.total.toFixed(4)}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Actual cost may vary based on response length
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
