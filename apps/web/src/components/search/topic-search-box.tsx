"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CornerDownLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TopicSearchBoxProps {
  /** Pre-fill the input (e.g. on the results page). Does NOT auto-open the dropdown. */
  initialQuery?: string;
  examId?: string;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
}

export function TopicSearchBox({
  initialQuery = "",
  examId,
  autoFocus = false,
  className,
  placeholder = "Search any topic — e.g. pharmacokinetics, Ohm's law, enzyme kinetics",
}: TopicSearchBoxProps): React.ReactElement {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [value, setValue] = useState(initialQuery);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Only show the dropdown when the user actually types — guards against
  // auto-opening over the results page on a programmatic value set.
  const typedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read the selected exam from dashboard context if not provided.
  const dashboardQuery = trpc.learn.getDashboardData.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: !examId,
  });
  const resolvedExamId = examId ?? dashboardQuery.data?.selectedExams?.[0]?.examId;

  // Prefetch the results route for instant navigation.
  useEffect(() => {
    router.prefetch("/dashboard/search" as "/");
  }, [router]);

  // Debounce the query (~180ms).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 180);
    return () => clearTimeout(t);
  }, [value]);

  const suggestQuery = trpc.topicSearch.suggest.useQuery(
    { q: debounced, examId: resolvedExamId },
    { enabled: debounced.length >= 2, staleTime: 30 * 1000 },
  );
  const suggestions = suggestQuery.data ?? [];

  // Re-check the typed ref when a fetch resolves so a late response can't
  // reopen the dropdown after navigation.
  useEffect(() => {
    if (suggestQuery.data && typedRef.current && debounced.length >= 2) {
      setOpen(true);
    }
  }, [suggestQuery.data, debounced]);

  const navigateToNode = useCallback(
    (nodeId: number, title: string) => {
      typedRef.current = false;
      setOpen(false);
      try {
        sessionStorage.setItem("examforge:lastSearch", JSON.stringify({ q: title, nodeId }));
      } catch {
        /* ignore */
      }
      startTransition(() => {
        router.push(`/dashboard/search?q=${encodeURIComponent(title)}&nodeId=${nodeId}` as "/");
      });
    },
    [router],
  );

  const navigateToQuery = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      typedRef.current = false;
      setOpen(false);
      try {
        sessionStorage.setItem("examforge:lastSearch", JSON.stringify({ q: trimmed }));
      } catch {
        /* ignore */
      }
      startTransition(() => {
        router.push(`/dashboard/search?q=${encodeURIComponent(trimmed)}` as "/");
      });
    },
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
        if (picked) navigateToNode(picked.nodeId, picked.title);
        else navigateToQuery(value);
      } else if (e.key === "Escape") {
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [activeIndex, suggestions, value, navigateToNode, navigateToQuery],
  );

  // Outside-click close.
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const showHint = value.trim().length >= 2 && suggestions.length === 0 && !suggestQuery.isFetching;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          type="text"
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Search topics"
          className="h-11 rounded-full pl-10 pr-10"
          onChange={(e) => {
            typedRef.current = true;
            setValue(e.target.value);
            setActiveIndex(-1);
            if (e.target.value.trim().length >= 2) setOpen(true);
            else setOpen(false);
          }}
          onFocus={() => {
            if (typedRef.current && value.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {suggestQuery.isFetching && (
          <Loader2 className="text-muted-foreground absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {open && (suggestions.length > 0 || showHint) && (
        <div className="bg-popover absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s.nodeId}
              type="button"
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => navigateToNode(s.nodeId, s.title)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors",
                i === activeIndex ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className="text-sm font-medium">{s.title}</span>
              {(s.subject || s.path) && (
                <span className="text-muted-foreground truncate text-xs">
                  {s.path || s.subject}
                </span>
              )}
            </button>
          ))}
          {showHint && (
            <div className="text-muted-foreground flex items-center gap-1.5 px-4 py-2.5 text-xs">
              <CornerDownLeft className="size-3" />
              Press Enter to search for &ldquo;{value.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
