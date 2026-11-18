"use client";

/**
 * SKILL FOUNDRY — maximalist decorative primitives:
 * marquee tickers, stickers, starburst stamp, fake barcode.
 */

export function Ticker({
  items,
  className = "",
  fast = false,
  reverse = false,
}: {
  items: string[];
  className?: string;
  fast?: boolean;
  reverse?: boolean;
}) {
  const half = (ariaHidden: boolean) => (
    <span
      aria-hidden={ariaHidden}
      className="flex shrink-0 items-center"
    >
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className="mx-5 flex items-center gap-5 font-mono text-xs font-bold tracking-[0.22em] sm:text-sm"
        >
          <span>{item}</span>
          <span aria-hidden className="text-base leading-none">
            ✦
          </span>
        </span>
      ))}
    </span>
  );

  return (
    <div
      className={`overflow-hidden border-forge-ink ${className}`}
      role="marquee"
      aria-label={items.join(", ")}
    >
      <div
        className={`marquee-track flex w-max whitespace-nowrap py-2 ${
          fast ? "marquee-fast" : ""
        } ${reverse ? "marquee-reverse" : ""}`}
      >
        {half(false)}
        {half(true)}
      </div>
    </div>
  );
}

export function Sticker({
  children,
  className = "",
  wobble = false,
}: {
  children: React.ReactNode;
  className?: string;
  wobble?: boolean;
}) {
  return (
    <span
      className={`inline-block border-[3px] border-forge-ink px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest hard-shadow-sm ${className} ${
        wobble ? "wobble" : ""
      }`}
    >
      {children}
    </span>
  );
}

/** Spiky rotating starburst stamp with static center text. */
export function Starburst({
  outerText,
  centerTop,
  centerBottom,
  className = "",
}: {
  outerText: string;
  centerTop: string;
  centerBottom: string;
  className?: string;
}) {
  const spikes = 28;
  const cx = 150;
  const cy = 150;
  const rOuter = 146;
  const rInner = 118;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 300 300"
        className="spin-slow h-full w-full"
        aria-hidden
      >
        <polygon
          points={pts.join(" ")}
          fill="var(--color-forge-lime)"
          stroke="var(--color-forge-ink)"
          strokeWidth="5"
        />
        <circle
          cx="150"
          cy="150"
          r="108"
          fill="none"
          stroke="var(--color-forge-ink)"
          strokeWidth="4"
          strokeDasharray="10 6"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-2xl leading-none sm:text-3xl">
            {centerTop}
          </p>
          <p className="mx-auto mt-1.5 max-w-[110px] font-mono text-[9px] font-bold uppercase tracking-[0.2em] sm:text-[10px]">
            {outerText}
          </p>
          <p className="mt-1.5 font-display text-xl leading-none text-forge-orange sm:text-2xl">
            {centerBottom}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Deterministic decorative barcode (pure integer math, SSR-safe). */
export function Barcode({
  seed = 7,
  className = "",
  label = "SF-9000",
}: {
  seed?: number;
  className?: string;
  label?: string;
}) {
  const bars = Array.from({ length: 34 }, (_, i) => {
    const h = (seed * 48271 + i * 104729) % 97;
    return 1 + (h % 3);
  });

  return (
    <div className={className} aria-hidden>
      <div className="flex h-12 items-end gap-[3px]">
        {bars.map((w, i) => (
          <div
            key={i}
            className="h-full bg-forge-ink"
            style={{ width: `${w * 2 + 2}px` }}
          />
        ))}
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-[0.45em]">
        *{label}*
      </p>
    </div>
  );
}
