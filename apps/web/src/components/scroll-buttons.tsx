"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown } from "lucide-react";

interface ScrollButtonsProps {
  /** If provided, scroll within this container. Otherwise, scroll the window. */
  containerRef?: RefObject<HTMLElement | null>;
}

export function ScrollButtons({ containerRef }: ScrollButtonsProps): React.ReactElement | null {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const updateVisibility = useCallback(() => {
    if (containerRef?.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      setShowTop(scrollTop > 200);
      setShowBottom(scrollHeight - scrollTop - clientHeight > 200);
    } else {
      const scrollY = window.scrollY;
      const windowH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      setShowTop(scrollY > 300);
      setShowBottom(scrollY + windowH < docH - 300);
    }
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef?.current;

    updateVisibility();

    if (el) {
      el.addEventListener("scroll", updateVisibility, { passive: true });
      const ro = new ResizeObserver(updateVisibility);
      ro.observe(el);
      return (): void => {
        el.removeEventListener("scroll", updateVisibility);
        ro.disconnect();
      };
    } else {
      window.addEventListener("scroll", updateVisibility, { passive: true });
      window.addEventListener("resize", updateVisibility, { passive: true });
      return (): void => {
        window.removeEventListener("scroll", updateVisibility);
        window.removeEventListener("resize", updateVisibility);
      };
    }
  }, [containerRef, updateVisibility]);

  const scrollToTop = useCallback((): void => {
    if (containerRef?.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [containerRef]);

  const scrollToBottom = useCallback((): void => {
    if (containerRef?.current) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }
  }, [containerRef]);

  if (!showTop && !showBottom) return null;

  return (
    <div className="fixed bottom-24 right-5 z-40 flex flex-col gap-2">
      {showTop && (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full border-slate-300 bg-white/90 shadow-md backdrop-blur-sm transition-all hover:bg-indigo-50 hover:shadow-lg dark:border-slate-600 dark:bg-slate-800/90 dark:hover:bg-slate-700"
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
          className="h-9 w-9 rounded-full border-slate-300 bg-white/90 shadow-md backdrop-blur-sm transition-all hover:bg-indigo-50 hover:shadow-lg dark:border-slate-600 dark:bg-slate-800/90 dark:hover:bg-slate-700"
          onClick={scrollToBottom}
          title="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
