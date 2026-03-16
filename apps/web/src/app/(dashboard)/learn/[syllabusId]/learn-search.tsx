"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface LearnSearchProps {
  syllabusId: number;
  onSelectNode: (nodeId: number) => void;
}

export function LearnSearch({ syllabusId, onSelectNode }: LearnSearchProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const searchQuery = trpc.learn.searchTutorials.useQuery(
    { syllabusId, query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 },
  );

  const handleSelect = (nodeId: number): void => {
    onSelectNode(nodeId);
    setQuery("");
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          placeholder="Search tutorials..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Results dropdown */}
      {debouncedQuery.length >= 2 && searchQuery.data && searchQuery.data.length > 0 && (
        <div className="bg-popover absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border shadow-md">
          {searchQuery.data.map((result) => (
            <button
              key={result.tutorialFileId}
              onClick={() => handleSelect(result.syllabusNodeId)}
              className="hover:bg-muted w-full px-3 py-2 text-left transition-colors"
            >
              <p className="truncate text-xs font-medium">{result.title}</p>
              {result.snippet && (
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
                  {result.snippet}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {debouncedQuery.length >= 2 && searchQuery.data && searchQuery.data.length === 0 && (
        <div className="bg-popover absolute left-0 right-0 top-full z-50 mt-1 rounded-md border p-3 shadow-md">
          <p className="text-muted-foreground text-center text-xs">No results found</p>
        </div>
      )}
    </div>
  );
}
