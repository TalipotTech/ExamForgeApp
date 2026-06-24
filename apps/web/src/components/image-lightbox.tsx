"use client";

import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, RotateCcw, RefreshCw } from "lucide-react";

interface ImageLightboxProps {
  open: boolean;
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
const STEP = 0.25;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function ImageLightbox({
  open,
  src,
  alt,
  caption,
  onClose,
}: ImageLightboxProps): React.ReactElement | null {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const movedRef = useRef(false);

  // Reset transform whenever a new image opens.
  useEffect(() => {
    if (open) {
      setScale(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    }
  }, [open, src]);

  // Re-center when zoomed back out — panning only makes sense above 100%.
  useEffect(() => {
    if (scale <= 1) setOffset({ x: 0, y: 0 });
  }, [scale]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const zoomIn = (): void => setScale((s) => clamp(s + STEP, MIN_SCALE, MAX_SCALE));
  const zoomOut = (): void => setScale((s) => clamp(s - STEP, MIN_SCALE, MAX_SCALE));
  const rotateCw = (): void => setRotation((r) => r + 90);
  const rotateCcw = (): void => setRotation((r) => r - 90);
  const reset = (): void => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const canPan = scale > 1;

  function onPointerDown(e: React.PointerEvent): void {
    if (!canPan) return;
    setDragging(true);
    movedRef.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }

  function onPointerUp(e: React.PointerEvent): void {
    if (dragging) {
      setDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate text-sm">{caption ?? alt}</span>
        <div className="flex items-center gap-1">
          <ToolbarButton label="Zoom out" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
            <ZoomOut className="size-5" />
          </ToolbarButton>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <ToolbarButton label="Zoom in" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
            <ZoomIn className="size-5" />
          </ToolbarButton>
          <ToolbarButton label="Rotate left" onClick={rotateCcw}>
            <RotateCcw className="size-5" />
          </ToolbarButton>
          <ToolbarButton label="Rotate right" onClick={rotateCw}>
            <RotateCw className="size-5" />
          </ToolbarButton>
          <ToolbarButton label="Reset" onClick={reset}>
            <RefreshCw className="size-5" />
          </ToolbarButton>
          <ToolbarButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </ToolbarButton>
        </div>
      </div>

      {/* Image stage */}
      <div
        className="flex flex-1 items-center justify-center overflow-hidden p-4"
        onClick={() => {
          // Don't close if this "click" was the tail of a pan drag.
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          onClose();
        }}
        onWheel={(e) => {
          if (e.deltaY < 0) zoomIn();
          else zoomOut();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          // Suppress the close-click only after an actual drag.
          onClick={(e) => {
            e.stopPropagation();
            if (movedRef.current) movedRef.current = false;
          }}
          className={`max-h-full max-w-full select-none object-contain ${
            canPan ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          } ${dragging ? "" : "transition-transform duration-150"}`}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-2 transition-colors hover:bg-white/20 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
