"use client";

import { CheckCircle, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type ProviderId = "claude" | "gemini" | "openai" | "mistral" | "perplexity";

interface ProviderOption {
  id: ProviderId;
  name: string;
  description: string;
  color: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "claude",
    name: "Claude",
    description: "Deep reasoning, detailed explanations",
    color: "bg-orange-500",
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Long context, visual descriptions",
    color: "bg-blue-500",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Structured output, concise",
    color: "bg-green-500",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Fast, cost-effective",
    color: "bg-purple-500",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Web-backed, current references",
    color: "bg-teal-500",
  },
];

interface AIProviderSelectorProps {
  mode?: "single" | "multi";
  selected: ProviderId[];
  onSelect: (providers: ProviderId[]) => void;
  compact?: boolean;
}

export function AIProviderSelector({
  mode = "multi",
  selected,
  onSelect,
  compact = false,
}: AIProviderSelectorProps): React.ReactElement {
  const allSelected = selected.length === PROVIDERS.length;

  function toggleProvider(id: ProviderId): void {
    if (mode === "single") {
      onSelect([id]);
      return;
    }
    if (selected.includes(id)) {
      onSelect(selected.filter((p) => p !== id));
    } else {
      onSelect([...selected, id]);
    }
  }

  function toggleAll(): void {
    if (allSelected) {
      onSelect([]);
    } else {
      onSelect(PROVIDERS.map((p) => p.id));
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <Button
            key={p.id}
            variant={selected.includes(p.id) ? "default" : "outline"}
            size="sm"
            onClick={() => toggleProvider(p.id)}
            className="text-xs"
          >
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.color}`} />
            {p.name}
          </Button>
        ))}
        {mode === "multi" && (
          <Button
            variant={allSelected ? "default" : "outline"}
            size="sm"
            onClick={toggleAll}
            className="text-xs"
          >
            <Zap className="mr-1 h-3 w-3" />
            All
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">AI Providers</Label>
        {mode === "multi" && (
          <Button variant={allSelected ? "default" : "outline"} size="sm" onClick={toggleAll}>
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Use All Providers
            {allSelected && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Merged
              </Badge>
            )}
          </Button>
        )}
      </div>
      <div className="grid gap-2">
        {PROVIDERS.map((p) => {
          const isSelected = selected.includes(p.id);
          return (
            <Card
              key={p.id}
              className={`cursor-pointer transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"
              }`}
              onClick={() => toggleProvider(p.id)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <Checkbox checked={isSelected} className="pointer-events-none" />
                <span className={`h-3 w-3 rounded-full ${p.color} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-muted-foreground text-xs">{p.description}</div>
                </div>
                {isSelected && <CheckCircle className="text-primary h-4 w-4 shrink-0" />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export type { ProviderId };
