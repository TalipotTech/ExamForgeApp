"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown } from "lucide-react";

interface ScrollButtonsProps {
  containerRef: RefObject<HTMLElement | null>;
}

export function ScrollButtons({ containerRef }: ScrollButtonsProps): React.ReactElement | null {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const updateVisibility = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setShowTop(scrollTop > 200);
    // Show bottom button when there's more than 200px left to scroll
    setShowBottom(scrollHeight - scrollTop - clientHeight > 200);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateVisibility();
    el.addEventListener("scroll", updateVisibility, { passive: true });
    // Also check on resize
    const ro = new ResizeObserver(updateVisibility);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", updateVisibility);
      ro.disconnect();
    };
  }, [containerRef, updateVisibility]);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [containerRef]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [containerRef]);

  if (!showTop && !showBottom) return null;

  return (
    <div className="fixed bottom-20 right-4 z-30 flex flex-col gap-2">
      {showTop && (
        <Button
          variant="outline"
          size="icon"
          className="bg-background h-9 w-9 rounded-full shadow-lg transition-opacity"
          onClick={scrollToTop}
          title="Scroll to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
      {showBottom && (
        <Button
          variant="outline"
          size="icon"
          className="bg-background h-9 w-9 rounded-full shadow-lg transition-opacity"
          onClick={scrollToBottom}
          title="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
