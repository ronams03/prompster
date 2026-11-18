"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { X, Circle } from "lucide-react";

/**
 * FloatingDevCard — click "DEVELOPER" and this circular anime avatar
 * of ROBERTH NAMOC floats onto the screen. Draggable via pointer capture.
 */
export function FloatingDevCard({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(
    null
  );
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = {
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width,
      h: r.height,
    };
    setPos({ x: r.left, y: r.top });
    setDragging(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: clamp(e.clientX - d.dx, 8, window.innerWidth - d.w - 8),
      y: clamp(e.clientY - d.dy, 8, window.innerHeight - d.h - 8),
    });
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const positionStyle = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <motion.div
      initial={{ scale: 0, rotate: -12, y: 40 }}
      animate={{ scale: 1, rotate: 0, y: 0 }}
      exit={{ scale: 0, rotate: 12, y: 40 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      className={`fixed z-[80] ${
        pos ? "" : "bottom-24 right-4 sm:right-8"
      } ${dragging ? "" : "transition-none"}`}
      style={positionStyle}
      role="dialog"
      aria-label="Developer card: Rob Namoc, IT developer"
    >
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`w-[248px] touch-none select-none border-4 border-forge-ink bg-forge-paper hard-shadow-lg sm:w-[264px] ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* window chrome */}
        <div className="flex items-center justify-between border-b-4 border-forge-ink bg-forge-ink px-3 py-1.5">
          <span className="font-mono text-[10px] font-bold tracking-[0.3em] text-forge-lime">
            DEV_CARD.EXE
          </span>
          <button
            type="button"
            aria-label="Close developer card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="grid h-5 w-5 place-items-center border-2 border-forge-lime bg-forge-ink text-forge-lime hover:bg-forge-magenta hover:text-forge-ink"
          >
            <X className="h-3 w-3" strokeWidth={3} />
          </button>
        </div>

        {/* floating circular avatar */}
        <div className="flex flex-col items-center px-4 pb-4 pt-5">
          <div className="relative">
            <div className="floaty relative">
              <div className="h-36 w-36 overflow-hidden rounded-full border-4 border-forge-ink bg-forge-lime sm:h-40 sm:w-40">
                <Image
                  src="/roberth-avatar.png"
                  alt="Anime avatar of Rob Namoc, IT developer wearing headphones"
                  width={320}
                  height={320}
                  priority
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
              {/* live status dot */}
              <span className="absolute left-3 top-3 grid place-items-center">
                <Circle
                  className="h-4 w-4 fill-forge-lime stroke-forge-ink animate-pulse"
                  strokeWidth={2}
                />
              </span>
              {/* builder sticker */}
              <span className="absolute -bottom-1 -right-3 rotate-6 border-[3px] border-forge-ink bg-forge-orange px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-forge-ink">
                THE BUILDER
              </span>
            </div>
          </div>

          <p className="mt-4 text-center font-display text-lg leading-none">
            ROBERTH NAMOC
          </p>
          <p className="mt-1.5 text-center font-mono text-[10px] font-bold tracking-[0.18em] text-forge-ink/70">
            IT · FULL-STACK · AI WRANGLER
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <span className="border-2 border-forge-ink bg-forge-magenta px-1.5 py-0.5 font-mono text-[9px] font-black uppercase">
              ZERO SLOP
            </span>
            <span className="border-2 border-forge-ink bg-forge-lime px-1.5 py-0.5 font-mono text-[9px] font-black uppercase">
              100% HUMAN
            </span>
            <span className="border-2 border-forge-ink bg-forge-yellow px-1.5 py-0.5 font-mono text-[9px] font-black uppercase">
              SHIPS FAST
            </span>
          </div>

          <p className="mt-3 font-mono text-[9px] tracking-widest text-forge-ink/50">
            {dragging ? "WHEEE—" : "DRAG ME ANYWHERE · I FLOAT"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
