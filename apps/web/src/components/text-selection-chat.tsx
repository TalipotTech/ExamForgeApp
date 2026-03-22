"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAiChatPopupStore } from "@/stores/ai-chat-popup-store";
import { MessageSquare } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * Renders a floating "Ask AI" button when user selects text on the page.
 * Uses a portal to render outside the component tree to avoid
 * interference from parent event handlers or conditional rendering.
 */
export function TextSelectionChat(): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [buttonPos, setButtonPos] = useState({ x: 0, y: 0 });
  const ignoreUntil = useRef(0);

  // Only render portal on client
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    function handleMouseUp(e: MouseEvent): void {
      // Skip if in cooldown (after Ask AI was clicked)
      if (Date.now() < ignoreUntil.current) return;

      // Skip clicks on the Ask AI button itself
      const btn = document.getElementById("text-selection-ask-ai");
      if (btn?.contains(e.target as Node)) return;

      // Skip clicks inside the AI chat popup
      const popup = document.querySelector("[data-ai-chat-popup]");
      if (popup?.contains(e.target as Node)) return;

      // Short delay to ensure selection is finalized
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";

        if (text.length < 5 || !sel?.rangeCount) {
          setSelectedText("");
          return;
        }

        try {
          const range = sel.getRangeAt(0);
          const popupEl = document.querySelector("[data-ai-chat-popup]");
          if (popupEl?.contains(range.commonAncestorContainer)) return;

          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;

          setSelectedText(text);
          // position: fixed — use viewport-relative coords (NO scrollY)
          setButtonPos({
            x: Math.min(Math.max(rect.left + rect.width / 2, 60), window.innerWidth - 60),
            y: Math.max(rect.top - 45, 10),
          });
        } catch {
          setSelectedText("");
        }
      }, 50);
    }

    // Use window (not document) to avoid framework-level event interception
    window.addEventListener("mouseup", handleMouseUp, true);
    return (): void => {
      window.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, [mounted]);

  function handleAskAI(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedText) return;

    // Set cooldown so the mouseup from this click is ignored
    ignoreUntil.current = Date.now() + 800;

    const { isOpen, openPopup } = useAiChatPopupStore.getState();
    if (!isOpen) openPopup();

    const truncated =
      selectedText.length > 500 ? selectedText.substring(0, 500) + "..." : selectedText;

    setSelectedText("");
    window.getSelection()?.removeAllRanges();

    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("ai-chat-prefill", {
          detail: `Explain this:\n\n"${truncated}"`,
        }),
      );
    }, 250);
  }

  if (!mounted) return null;

  const visible = selectedText.length >= 5;

  // Render via portal to ensure no parent interference
  return createPortal(
    <div
      id="text-selection-ask-ai"
      style={{
        position: "fixed",
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: visible ? "block" : "none",
      }}
    >
      <Button
        size="sm"
        className="animate-in fade-in zoom-in-95 gap-1.5 rounded-full px-3 py-1.5 shadow-lg"
        onMouseDown={(ev): void => {
          ev.preventDefault();
        }}
        onClick={handleAskAI}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Ask AI
      </Button>
    </div>,
    document.body,
  );
}
