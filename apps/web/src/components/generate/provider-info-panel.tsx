"use client";

import { Info, DollarSign, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AI_PROVIDER_INFO, AI_COST_PER_1K_TOKENS } from "@examforge/shared/constants";

interface ProviderInfoPanelProps {
  provider: "anthropic" | "mistral" | "openai" | "google";
  count: number;
}

type Provider = "anthropic" | "mistral" | "openai" | "google";

function estimateCost(
  provider: Provider,
  count: number,
): { inputCost: number; outputCost: number; total: number } {
  const info = AI_PROVIDER_INFO[provider];
  if (!info) {
    return { inputCost: 0, outputCost: 0, total: 0 };
  }
  const costs = AI_COST_PER_1K_TOKENS[info.model as keyof typeof AI_COST_PER_1K_TOKENS];
  if (!costs) {
    return { inputCost: 0, outputCost: 0, total: 0 };
  }

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

export function ProviderInfoPanel({ provider, count }: ProviderInfoPanelProps): React.ReactElement {
  const info = AI_PROVIDER_INFO[provider];
  if (!info) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-sm">Unknown provider: {provider}</p>
        </CardContent>
      </Card>
    );
  }
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
          <div className="text-muted-foreground mt-0.5 text-xs">
            Model: <code className="text-xs">{info.model}</code>
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-1.5 text-sm">{info.description}</div>
        </div>

        <div>
          <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
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

        <div className="bg-muted/50 rounded-lg border p-3">
          <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
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
          <p className="text-muted-foreground mt-2 text-[11px]">
            Actual cost may vary based on response length
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
