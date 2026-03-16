"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface SelectionTooltipProps {
  containerRef: RefObject<HTMLDivElement | null>;
  onAskAi: (selectedText: string) => void;
}

export function SelectionTooltip({
  containerRef,
  onAskAi,
}: SelectionTooltipProps): React.ReactElement | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const handleMouseUp = useCallback(() => {
    // Small delay to let the selection finalize
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 3 || !containerRef.current) {
        setPosition(null);
        setSelectedText("");
        return;
      }

      // Check if selection is within our container
      const range = selection?.getRangeAt(0);
      if (!range) return;

      const selectionNode = range.commonAncestorContainer;
      if (!containerRef.current.contains(selectionNode)) {
        setPosition(null);
        setSelectedText("");
        return;
      }

      const rect = range.getBoundingClientRect();
      setPosition({
        top: rect.top - 40,
        left: rect.left + rect.width / 2 - 50,
      });
      setSelectedText(text);
    }, 10);
  }, [containerRef]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Hide tooltip if clicking outside of it
    const target = e.target as HTMLElement;
    if (!target.closest("[data-selection-tooltip]")) {
      setPosition(null);
      setSelectedText("");
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [handleMouseUp, handleMouseDown]);

  const handleAskAi = useCallback(() => {
    if (selectedText) {
      onAskAi(selectedText);
      setPosition(null);
      setSelectedText("");
      window.getSelection()?.removeAllRanges();
    }
  }, [selectedText, onAskAi]);

  if (!position || !selectedText) return null;

  return (
    <div
      data-selection-tooltip
      className="animate-in fade-in zoom-in-95 fixed z-50"
      style={{
        top: `${Math.max(position.top, 8)}px`,
        left: `${Math.max(position.left, 8)}px`,
      }}
    >
      <Button size="sm" className="gap-1.5 rounded-full shadow-lg" onClick={handleAskAi}>
        <MessageCircle className="h-3.5 w-3.5" />
        Ask AI
      </Button>
    </div>
  );
}
