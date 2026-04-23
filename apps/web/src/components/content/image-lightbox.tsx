"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
} from "lucide-react";

/**
 * Fullscreen image lightbox — adapted from PadVik's implementation.
 * Keyboard: ←/→ navigate · +/- zoom · R rotate · Esc close · 0 reset.
 * Mouse:    wheel to zoom · drag to pan when zoomed in.
 */
export function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}): React.ReactElement | null {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const resetTransform = useCallback((): void => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const prev = useCallback((): void => {
    if (index > 0) {
      setIndex((i) => i - 1);
      resetTransform();
    }
  }, [index, resetTransform]);

  const next = useCallback((): void => {
    if (index < images.length - 1) {
      setIndex((i) => i + 1);
      resetTransform();
    }
  }, [index, images.length, resetTransform]);

  const zoomIn = useCallback((): void => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback((): void => setScale((s) => Math.max(s - 0.25, 0.25)), []);
  const rotateCW = useCallback((): void => setRotation((r) => (r + 90) % 360), []);
  const rotateCCW = useCallback((): void => setRotation((r) => (r - 90 + 360) % 360), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          next();
          break;
        case "ArrowLeft":
          prev();
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
        case "_":
          zoomOut();
          break;
        case "r":
        case "R":
          rotateCW();
          break;
        case "0":
          resetTransform();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return (): void => window.removeEventListener("keydown", handler);
  }, [onClose, next, prev, zoomIn, zoomOut, rotateCW, resetTransform]);

  function handleWheel(e: React.WheelEvent): void {
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }

  function handleMouseDown(e: React.MouseEvent): void {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }

  function handleMouseMove(e: React.MouseEvent): void {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp(): void {
    setIsDragging(false);
  }

  if (images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black/95"
      onClick={onClose}
      onWheel={handleWheel}
    >
      <div
        className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={zoomOut}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          <ZoomOut className="size-5" />
        </button>
        <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-white/80">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <ZoomIn className="size-5" />
        </button>
        <div className="mx-1 h-5 w-px bg-white/20" />
        <button
          type="button"
          onClick={rotateCCW}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          title="Rotate left"
          aria-label="Rotate left"
        >
          <RotateCcw className="size-5" />
        </button>
        <button
          type="button"
          onClick={rotateCW}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          title="Rotate right (R)"
          aria-label="Rotate right"
        >
          <RotateCw className="size-5" />
        </button>
        <div className="mx-1 h-5 w-px bg-white/20" />
        <button
          type="button"
          onClick={resetTransform}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          title="Reset (0)"
          aria-label="Reset"
        >
          <Maximize2 className="size-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 rounded-full bg-black/60 p-2 text-white/80 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
        title="Close (Esc)"
        aria-label="Close"
      >
        <X className="size-6" />
      </button>

      {images.length > 1 && (
        <div className="absolute left-4 top-4 z-10 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white/80 backdrop-blur">
          {index + 1} / {images.length}
        </div>
      )}

      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/70 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
          title="Previous (←)"
          aria-label="Previous image"
        >
          <ChevronLeft className="size-8" />
        </button>
      )}

      <img
        src={images[index]}
        alt=""
        className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain transition-transform duration-150"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
          cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        draggable={false}
      />

      {index < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/70 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
          title="Next (→)"
          aria-label="Next image"
        >
          <ChevronRight className="size-8" />
        </button>
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 select-none text-[10px] text-white/40">
        ← → navigate · +/- zoom · R rotate · scroll to zoom · Esc close
      </div>
    </div>
  );
}
