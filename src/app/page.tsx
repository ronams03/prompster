"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Keyboard,
  Hammer,
  PackageOpen,
  Rocket,
  Download,
  Copy,
  Check,
  TriangleAlert,
  FileText,
  FileJson,
  FileArchive,
  Package,
  ArrowDown,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Ticker, Sticker, Starburst, Barcode } from "@/components/forge/ticker";
import { ForgeMarkdown } from "@/components/forge/markdown";
import { FloatingDevCard } from "@/components/forge/dev-card";
import {
  buildJsonExport,
  splitFrontmatter,
  type SkillData,
} from "@/lib/skill-types";

const PRESETS = [
  "Turn messy CSV exports into clean monthly Excel reports with charts",
  "Extract structured line-items from PDF invoices and return JSON",
  "Review pull requests and write brutal but kind code reviews",
  "Draft Slack standup updates from git commit history",
  "Research any topic across the web and produce a cited brief",
  "Write conventional commit messages from staged diffs",
];

const FORGE_STATUS = [
  "CALIBRATING PROMPT LENSES…",
  "MINING YAML FRONTMATTER…",
  "SMELTING REFERENCE FILES…",
  "POLISHING MARKDOWN INGOTS…",
  "PRESSING ZIP PLATES…",
  "RUNNING SLOP DETECTION… 0.00%",
];

/** Error returned by the API itself (JSON, res.ok === false) — not worth retrying. */
class ForgeApiError extends Error {}

/** One strike at the forge API. Consumes the NDJSON event stream (ping/progress/done/error). */
async function forgeOnce(
  value: string,
  signal: AbortSignal,
  onChars: (total: number) => void
): Promise<SkillData> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: value }),
    signal,
  });
  if (!res.ok) {
    // API-level error (4xx/5xx, plain JSON)
    let msg = "THE FOUNDRY JAMMED — the forge refused the strike.";
    try {
      const j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch {
      /* non-JSON body */
    }
    throw new ForgeApiError(msg);
  }
  if (!res.body) throw new Error("LINK_SEVERED");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let forged: SkillData | null = null;
  let streamError: string | null = null;

  const handleLine = (line: string) => {
    const t = line.trim();
    if (!t) return;
    let evt: {
      t?: string;
      chars?: number;
      skill?: SkillData;
      error?: string;
    };
    try {
      evt = JSON.parse(t);
    } catch {
      return; // stray non-JSON bytes (e.g. a proxy error page) — ignore
    }
    if (evt.t === "progress" && typeof evt.chars === "number") {
      onChars(evt.chars);
    } else if (evt.t === "done" && evt.skill) {
      forged = evt.skill;
    } else if (evt.t === "error" && evt.error) {
      streamError = evt.error;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handleLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  if (buf.trim()) handleLine(buf);

  if (forged) return forged;
  if (streamError) throw new ForgeApiError(streamError);
  throw new Error("LINK_SEVERED");
}

const STEPS = [
  {
    n: "01",
    icon: Keyboard,
    title: "TYPE THE PROMPT",
    desc: "Describe the capability you want. One line is enough.",
  },
  {
    n: "02",
    icon: Hammer,
    title: "AI FORGES THE SKILL",
    desc: "Frontmatter, workflow, examples and reference files — written in seconds.",
  },
  {
    n: "03",
    icon: PackageOpen,
    title: "PICK YOUR FORMAT",
    desc: "MD, JSON, ZIP pack, all-in-one archive or raw code. Copy it or download it.",
  },
  {
    n: "04",
    icon: Rocket,
    title: "SHIP TO YOUR AGENT",
    desc: "Drop the folder into your skills directory. Done. Go build.",
  },
];

function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const kb = (s: string) => `${Math.max(0.1, s.length / 1024).toFixed(1)} KB`;

export default function Home() {
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [skill, setSkill] = useState<SkillData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [forgedChars, setForgedChars] = useState(0);
  const [tab, setTab] = useState("md");
  const [activeFile, setActiveFile] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [zippingAll, setZippingAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t = window.setInterval(
      () => setProgress((p) => Math.min(p + Math.random() * 6 + 2, 92)),
      650
    );
    const s = window.setInterval(
      () => setStatusIdx((i) => (i + 1) % FORGE_STATUS.length),
      2400
    );
    return () => {
      window.clearInterval(t);
      window.clearInterval(s);
    };
  }, [loading]);

  const handleForge = useCallback(async () => {
    const value = prompt.trim();
    if (!value || loading) return;
    setLoading(true);
    setProgress(6);
    setStatusIdx(0);
    setRetrying(false);
    setForgedChars(0);
    setError(null);

    // hard ceiling so the UI never hangs forever on a dead link
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 210_000);

    try {
      let forged: SkillData | null = null;
      let failure = "THE FOUNDRY JAMMED — unknown fault. Strike again.";

      // live byte counter from the forge stream — real progress, not vibes
      const onChars = (chars: number) => {
        setForgedChars(chars);
        setProgress((p) => Math.max(p, Math.min(94, 8 + chars / 24)));
      };

      // up to two automatic re-strikes when the link blips (HTML error page / dropped JSON)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          forged = await forgeOnce(value, controller.signal, onChars);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            failure =
              "FORGE TIMEOUT — 210s elapsed without a result. Try a shorter, sharper prompt and strike again.";
            break;
          }
          if (e instanceof ForgeApiError) {
            failure = e.message;
            break; // API said no — retrying changes nothing
          }
          if (e instanceof Error && e.message === "LINK_SEVERED") {
            failure =
              "FOUNDRY LINK SEVERED — the server dropped mid-forge. Give it a few seconds (it may be waking up), then strike again.";
          } else if (e instanceof SyntaxError) {
            failure =
              "FOUNDRY LINK SEVERED — the response was cut off mid-forge. Strike again.";
          } else if (e instanceof Error) {
            failure = e.message;
          }
          if (attempt < 3) {
            setRetrying(true);
            // widen the backoff: 1.8s, then 4s — covers a server mid-restart
            await new Promise((r) => setTimeout(r, attempt === 1 ? 1800 : 4000));
            setRetrying(false);
          }
        }
      }

      if (!forged) throw new Error(failure);

      setSkill(forged);
      setTab("md");
      setActiveFile(0);
      toast({
        title: "SKILL FORGED",
        description: `${forged.name} is hot and ready to ship.`,
      });
      window.setTimeout(
        () => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "UNKNOWN FOUNDRY FAULT");
    } finally {
      setLoading(false);
      setProgress(0);
      setRetrying(false);
      setForgedChars(0);
      window.clearTimeout(timer);
    }
  }, [prompt, loading, toast]);

  const handleDownloadMd = useCallback(() => {
    if (!skill) return;
    saveBlob(`${skill.name}.SKILL.md`, new Blob([skill.skillMd], { type: "text/markdown" }));
    toast({ title: "MD SHIPPED", description: `${skill.name}.SKILL.md downloaded.` });
  }, [skill, toast]);

  const handleDownloadJson = useCallback(() => {
    if (!skill) return;
    const json = JSON.stringify(buildJsonExport(skill), null, 2);
    saveBlob(`${skill.name}.skill.json`, new Blob([json], { type: "application/json" }));
    toast({ title: "JSON SHIPPED", description: `${skill.name}.skill.json downloaded.` });
  }, [skill, toast]);

  const handleDownloadZip = useCallback(async () => {
    if (!skill) return;
    setZipping(true);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/zip")) {
        throw new Error("ZIP PRESS FAILED");
      }
      const blob = await res.blob();
      saveBlob(`${skill.name}-skill-pack.zip`, blob);
      toast({ title: "ZIP PACK SHIPPED", description: `${skill.name}-skill-pack.zip downloaded.` });
    } catch {
      toast({ title: "ZIP PRESS FAILED", description: "Try again — the press jammed.", variant: "destructive" });
    } finally {
      setZipping(false);
    }
  }, [skill, toast]);

  const handleDownloadAllZip = useCallback(async () => {
    if (!skill) return;
    setZippingAll(true);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, format: "all" }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/zip")) {
        throw new Error("ALL-IN-ONE PRESS FAILED");
      }
      const blob = await res.blob();
      saveBlob(`${skill.name}-all-in-one.zip`, blob);
      toast({
        title: "ALL-IN-ONE SHIPPED",
        description: `${skill.name}-all-in-one.zip — md + json + txt + scripts in one archive.`,
      });
    } catch {
      toast({ title: "PRESS JAMMED", description: "All-in-one press failed — strike it again.", variant: "destructive" });
    } finally {
      setZippingAll(false);
    }
  }, [skill, toast]);

  const handleCopy = useCallback(async () => {
    if (!skill) return;
    try {
      await navigator.clipboard.writeText(skill.skillMd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ title: "COPIED", description: "SKILL.md is on your clipboard." });
    } catch {
      toast({ title: "COPY BLOCKED", description: "Clipboard denied by browser.", variant: "destructive" });
    }
  }, [skill, toast]);

  const jsonPreview = skill ? JSON.stringify(buildJsonExport(skill), null, 2) : "";
  const { fm, body } = skill ? splitFrontmatter(skill.skillMd) : { fm: [], body: "" };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-forge-paper text-forge-ink">
      {/* film grain over everything */}
      <div aria-hidden className="grain" />

      {/* ══════════ TOP TICKER ══════════ */}
      <Ticker
        items={[
          "PROMPT IN → SKILL OUT",
          "MD · JSON · ZIP · ALL-IN-ONE",
          "ZERO SLOP GUARANTEED",
          "AGENT-READY OUTPUT",
          "SKILL FOUNDRY™ EST. 2025",
        ]}
        className="border-b-4 bg-forge-ink text-forge-lime"
      />

      {/* ══════════ HEADER ══════════ */}
      <header className="sticky top-0 z-40 border-b-4 border-forge-ink bg-forge-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center border-[3px] border-forge-ink bg-forge-ink hard-shadow-sm">
              <span className="font-display text-base text-forge-lime">SF</span>
            </div>
            <div>
              <p className="font-display text-lg leading-none sm:text-xl">
                SKILL FOUNDRY<span className="text-forge-orange">™</span>
              </p>
              <p className="mt-1 font-mono text-[9px] font-bold tracking-[0.3em] text-forge-ink/60">
                AI SKILL GENERATOR
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Sticker className="bg-forge-lime">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-forge-ink align-middle" />
              MAX MODE: ON
            </Sticker>
            <Sticker className="-rotate-2 bg-forge-yellow">V2.6</Sticker>
            <Sticker className="rotate-1 border-dashed bg-transparent">
              EST. 2025
            </Sticker>
          </div>
          <a
            href="#forge"
            className="border-[3px] border-forge-ink bg-forge-orange px-4 py-2 font-display text-sm text-forge-ink shadow-[4px_4px_0_0_var(--color-forge-ink)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-forge-ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none md:hidden"
          >
            FORGE
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* ══════════ HERO ══════════ */}
        <section className="relative border-b-4 border-forge-ink grid-paper">
          <div
            aria-hidden
            className="halftone absolute left-0 top-0 h-40 w-40 opacity-60 [mask-image:radial-gradient(closest-side,black,transparent)]"
          />
          <div
            aria-hidden
            className="stripes-ink absolute bottom-0 right-0 h-28 w-52 opacity-[0.07]"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.55fr_1fr] lg:py-20">
            <div>
              <div className="mb-7 flex flex-wrap gap-2.5">
                <Sticker className="-rotate-2 bg-forge-magenta text-forge-ink">
                  ZERO SLOP
                </Sticker>
                <Sticker className="rotate-1 bg-forge-ink text-forge-paper">
                  AGENT-READY
                </Sticker>
                <Sticker className="-rotate-1 bg-forge-yellow">
                  5 EXPORT FORMATS
                </Sticker>
                <Sticker className="rotate-2 bg-forge-lime">
                  MAXIMALIST BY DEFAULT
                </Sticker>
              </div>
              <h1 className="font-display text-[clamp(3rem,9vw,7rem)] leading-[0.92] tracking-tight">
                PROMPT IN.
                <br />
                <span className="text-stroke-ink">SKILL</span>{" "}
                <span className="relative inline-block -rotate-1 border-4 border-forge-ink bg-forge-lime px-3 shadow-[6px_6px_0_0_var(--color-forge-ink)]">
                  OUT.
                </span>
              </h1>
              <p className="mt-7 max-w-xl text-base font-medium leading-relaxed sm:text-lg">
                Describe any capability. The Foundry forges a production-grade
                agent skill — SKILL.md with frontmatter, workflow, examples and
                reference files — then hands it over as{" "}
                <span className="bg-forge-yellow px-1 font-bold">MD</span>,{" "}
                <span className="bg-forge-orange px-1 font-bold">JSON</span>,{" "}
                <span className="bg-forge-lime px-1 font-bold">ZIP</span> or raw{" "}
                <span className="bg-forge-magenta px-1 font-bold">CODE</span>.
                Download it. Ship it to your agent. Repeat.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <a
                  href="#forge"
                  className="inline-flex items-center gap-2.5 border-4 border-forge-ink bg-forge-ink px-7 py-4 font-display text-lg text-forge-lime shadow-[6px_6px_0_0_var(--color-forge-orange)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[5px_5px_0_0_var(--color-forge-orange)] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none"
                >
                  START FORGING <ArrowDown className="h-5 w-5" strokeWidth={3} />
                </a>
                <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-forge-ink/60">
                  NO SIGNUP · NO SLOP · NO MERCY
                </p>
              </div>
            </div>

            <div className="hidden flex-col items-center gap-8 sm:flex">
              <Starburst
                centerTop="100% MAX"
                outerText="CERTIFIED SLOP-FREE · FOUNDRY SEAL · REV 2.6"
                centerBottom="NO SLOP"
                className="h-64 w-64 lg:h-72 lg:w-72"
              />
              <Barcode seed={20250612} label="SF-9000-MAX" className="w-56" />
            </div>
          </div>
        </section>

        {/* ══════════ STATS STRIP ══════════ */}
        <section
          aria-label="Foundry stats"
          className="border-b-4 border-forge-ink bg-forge-yellow"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-2 lg:grid-cols-4">
            {[
              { k: "EXPORT FORMATS", v: "5", note: "MD / JSON / ZIP / CODE / ALL-IN-ONE" },
              { k: "FILES PER PACK", v: "∞", note: "SKILL.MD + REFERENCES" },
              { k: "SLOP DETECTED", v: "0%", note: "LAB-TESTED DAILY" },
              { k: "FORGE POWER", v: "9000", note: "CAPACITY UNITS ⚡" },
            ].map((cell, i) => (
              <div
                key={cell.k}
                className={`border-forge-ink p-5 sm:p-6 ${
                  i % 2 === 1 ? "border-l-4" : ""
                } ${i >= 2 ? "border-t-4 lg:border-t-0" : ""} ${
                  i === 1 ? "lg:border-l-4" : ""
                } ${i === 2 ? "lg:border-l-4" : ""} ${i === 3 ? "lg:border-l-4" : ""} ${
                  i === 2 ? "max-lg:border-l-0" : ""
                }`}
              >
                <p className="font-display text-4xl leading-none sm:text-5xl">
                  {cell.v}
                </p>
                <p className="mt-2 font-mono text-[10px] font-black tracking-[0.22em]">
                  {cell.k}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-widest text-forge-ink/60">
                  {cell.note}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════ FORGE CONSOLE ══════════ */}
        <section
          id="forge"
          className="relative scroll-mt-20 border-b-4 border-forge-ink bg-forge-ink text-forge-paper scanlines"
        >
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-3xl text-forge-lime sm:text-4xl">
                {"// THE FORGE CONSOLE"}
              </h2>
              <p className="font-mono text-[11px] tracking-[0.25em] text-forge-paper/60">
                INPUT_BAY_01 <span className="blink text-forge-orange">▮</span>
              </p>
            </div>

            {/* terminal window */}
            <div className="mt-8 border-4 border-forge-paper shadow-[10px_10px_0_0_var(--color-forge-lime)]">
              <div className="flex items-center gap-2 border-b-4 border-forge-paper bg-forge-paper px-4 py-2.5">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-forge-ink bg-forge-orange" />
                <span className="h-3.5 w-3.5 rounded-full border-2 border-forge-ink bg-forge-yellow" />
                <span className="h-3.5 w-3.5 rounded-full border-2 border-forge-ink bg-forge-lime" />
                <span className="ml-3 font-mono text-[11px] font-bold tracking-widest text-forge-ink">
                  prompt.txt — raw, unedited, dangerous
                </span>
              </div>
              <label htmlFor="forge-prompt" className="sr-only">
                Describe the skill you want the AI to forge
              </label>
              <textarea
                id="forge-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleForge();
                }}
                placeholder="e.g. A skill that turns messy CSV exports into clean monthly Excel reports with charts, summaries and pivot-ready sheets…"
                className="block w-full resize-y bg-transparent p-5 font-mono text-sm text-forge-paper caret-forge-lime outline-none placeholder:text-forge-paper/35 sm:text-base"
                rows={4}
                maxLength={2000}
              />
              <div className="flex items-center justify-between border-t-2 border-forge-paper/30 px-5 py-2 font-mono text-[10px] tracking-widest text-forge-paper/50">
                <span>CTRL+ENTER TO STRIKE THE HAMMER</span>
                <span>{prompt.length}/2000</span>
              </div>
            </div>

            {/* presets */}
            <div className="mt-6">
              <p className="font-mono text-[10px] font-black tracking-[0.3em] text-forge-lime">
                QUICK IGNITION PRESETS:
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {PRESETS.map((p, i) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className={`border-2 border-forge-paper/60 px-3 py-1.5 font-mono text-[11px] text-forge-paper/90 transition-colors hover:border-forge-lime hover:bg-forge-lime hover:text-forge-ink ${
                      i % 3 === 0 ? "-rotate-1" : i % 3 === 1 ? "rotate-1" : ""
                    }`}
                  >
                    {p.length > 46 ? `${p.slice(0, 46)}…` : p}
                  </button>
                ))}
              </div>
            </div>

            {/* strike button + progress */}
            <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleForge}
                disabled={loading || !prompt.trim()}
                className="inline-flex items-center justify-center gap-3 border-4 border-forge-paper bg-forge-lime px-9 py-4.5 font-display text-xl text-forge-ink shadow-[8px_8px_0_0_var(--color-forge-orange)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[7px_7px_0_0_var(--color-forge-orange)] active:translate-x-[8px] active:translate-y-[8px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-2xl"
              >
                <Hammer className="h-6 w-6" strokeWidth={2.5} />
                {loading ? "FORGING…" : "FORGE SKILL ⚒"}
              </button>
              <p className="font-mono text-[11px] leading-relaxed tracking-widest text-forge-paper/50 sm:max-w-[240px] sm:text-right">
                AI WRITES SKILL.MD + REFERENCE FILES. TAKES ~30 SECONDS. STAYS
                SHARP.
              </p>
            </div>

            {loading && (
              <div className="mt-6 border-[3px] border-forge-lime p-4">
                <div className="flex items-center justify-between gap-4 font-mono text-[11px] font-bold tracking-widest text-forge-lime">
                  <span className="blink">
                    {retrying
                      ? "LINK BLIPPED — RE-STRIKING AUTOMATICALLY…"
                      : `${FORGE_STATUS[statusIdx]}${
                          forgedChars > 0 ? ` · ${forgedChars} CHARS` : ""
                        }`}
                  </span>
                  <span>{Math.floor(progress)}%</span>
                </div>
                <div className="mt-3 h-4 border-2 border-forge-lime bg-forge-ink">
                  <div
                    className="stripes-ink h-full bg-forge-lime transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="mt-6 flex items-start gap-3 border-[3px] border-forge-magenta bg-forge-magenta/10 p-4 text-forge-paper">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-forge-magenta" strokeWidth={2.5} />
                <div>
                  <p className="font-display text-sm tracking-wide">{error}</p>
                  <p className="mt-1 font-mono text-[10px] tracking-widest text-forge-paper/60">
                    RE-CHECK THE PROMPT AND STRIKE AGAIN.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ══════════ OUTPUT DECK ══════════ */}
        <section
          ref={outputRef}
          id="output"
          className="scroll-mt-20 border-b-4 border-forge-ink bg-forge-paper halftone-soft"
        >
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-3xl sm:text-4xl">
                {"// FRESHLY FORGED"}
              </h2>
              {skill && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <Sticker className="rotate-1 bg-forge-ink text-forge-lime">
                    {skill.emoji} {skill.name}
                  </Sticker>
                  {skill.tags.slice(0, 4).map((t, i) => (
                    <span
                      key={t}
                      className={`border-2 border-forge-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        i % 2 === 0 ? "bg-forge-yellow" : "bg-forge-paper"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* loading skeleton */}
            {loading && (
              <div className="mt-8 border-4 border-forge-ink bg-forge-paper p-6 hard-shadow" aria-hidden>
                <p className="font-mono text-xs font-bold tracking-[0.3em] text-forge-ink/50">
                  OPENING THE MOLDS…
                </p>
                <div className="mt-5 space-y-3">
                  <div className="h-8 w-2/3 animate-pulse bg-forge-ink/10" />
                  <div className="h-4 w-full animate-pulse bg-forge-ink/10" />
                  <div className="h-4 w-11/12 animate-pulse bg-forge-ink/10" />
                  <div className="h-4 w-4/5 animate-pulse bg-forge-ink/10" />
                  <div className="h-24 w-full animate-pulse bg-forge-ink/10" />
                </div>
              </div>
            )}

            {/* empty state */}
            {!loading && !skill && (
              <div className="mt-8 border-4 border-dashed border-forge-ink/60 bg-forge-paper p-8 text-center sm:p-12">
                <p className="font-display text-6xl text-forge-ink/15 sm:text-7xl">∅</p>
                <p className="mt-4 font-display text-xl sm:text-2xl">
                  NO SKILL FORGED YET
                </p>
                <pre
                  aria-hidden
                  className="mx-auto mt-6 w-max border-2 border-forge-ink/30 bg-forge-ink px-6 py-4 text-left font-mono text-[11px] leading-relaxed text-forge-lime/80 sm:text-xs"
                >
{`┌──────────────────────────────┐
│  FOUNDRY STATUS: IDLE        │
│  FURNACE: COLD               │
│  WAITING FOR PROMPT ABOVE ↑  │
└──────────────────────────────┘`}
                </pre>
                <p className="mt-6 font-mono text-[11px] tracking-[0.25em] text-forge-ink/50">
                  TYPE A PROMPT INTO THE CONSOLE AND STRIKE THE HAMMER
                </p>
              </div>
            )}

            {/* result */}
            {!loading && skill && (
              <div className="mt-8">
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-4 border-forge-ink bg-forge-ink p-1.5 forge-scroll">
                    <TabsTrigger
                      value="md"
                      className="rounded-none border-2 border-transparent px-4 py-2 font-display text-sm text-forge-paper data-[state=active]:border-forge-lime data-[state=active]:bg-forge-lime data-[state=active]:text-forge-ink sm:text-base"
                    >
                      SKILL.MD
                    </TabsTrigger>
                    <TabsTrigger
                      value="json"
                      className="rounded-none border-2 border-transparent px-4 py-2 font-display text-sm text-forge-paper data-[state=active]:border-forge-orange data-[state=active]:bg-forge-orange data-[state=active]:text-forge-ink sm:text-base"
                    >
                      JSON
                    </TabsTrigger>
                    <TabsTrigger
                      value="files"
                      className="rounded-none border-2 border-transparent px-4 py-2 font-display text-sm text-forge-paper data-[state=active]:border-forge-magenta data-[state=active]:bg-forge-magenta data-[state=active]:text-forge-ink sm:text-base"
                    >
                      FILES ({skill.files.length + 1})
                    </TabsTrigger>
                  </TabsList>

                  {/* SKILL.MD preview */}
                  <TabsContent value="md" className="mt-6">
                    <div className="border-4 border-forge-ink bg-white p-5 hard-shadow sm:p-7">
                      {fm.length > 0 && (
                        <div className="forge-scroll-paper mb-6 overflow-x-auto border-[3px] border-forge-ink bg-forge-yellow p-4">
                          <p className="font-mono text-[10px] font-black tracking-[0.3em] text-forge-ink/60">
                            YAML FRONTMATTER
                          </p>
                          <div className="mt-2 space-y-1 font-mono text-xs">
                            {fm.map((row) => (
                              <p key={row.key} className="break-words">
                                <span className="font-black text-forge-magenta">
                                  {row.key}
                                </span>
                                <span className="text-forge-ink/60">: </span>
                                <span>{row.value}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      <ForgeMarkdown source={body} />
                    </div>
                  </TabsContent>

                  {/* JSON export */}
                  <TabsContent value="json" className="mt-6">
                    <div className="border-4 border-forge-ink bg-forge-ink hard-shadow">
                      <div className="flex items-center justify-between border-b-[3px] border-forge-paper/30 px-4 py-2">
                        <p className="font-mono text-[11px] font-bold tracking-widest text-forge-lime">
                          {skill.name}.skill.json
                        </p>
                        <button
                          type="button"
                          onClick={handleDownloadJson}
                          className="border-2 border-forge-lime px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-forge-lime hover:bg-forge-lime hover:text-forge-ink"
                        >
                          SAVE
                        </button>
                      </div>
                      <pre className="forge-scroll max-h-[540px] overflow-auto p-5 font-mono text-xs leading-relaxed text-forge-lime">
                        {jsonPreview}
                      </pre>
                    </div>
                  </TabsContent>

                  {/* raw files / code */}
                  <TabsContent value="files" className="mt-6">
                    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
                        {[
                          { path: "SKILL.md", content: skill.skillMd },
                          ...skill.files,
                        ].map((f, i) => (
                          <button
                            key={f.path}
                            type="button"
                            onClick={() => setActiveFile(i)}
                            className={`flex shrink-0 items-center justify-between gap-2 border-[3px] border-forge-ink px-3 py-2.5 text-left font-mono text-[11px] font-bold transition-all md:w-full ${
                              activeFile === i
                                ? "bg-forge-ink text-forge-lime shadow-[3px_3px_0_0_var(--color-forge-orange)]"
                                : "bg-forge-paper text-forge-ink hover:bg-forge-yellow"
                            }`}
                          >
                            <span className="truncate">{f.path}</span>
                            <span className="shrink-0 opacity-60">
                              {kb(f.content)}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="border-4 border-forge-ink bg-forge-ink hard-shadow">
                        <div className="border-b-[3px] border-forge-paper/30 px-4 py-2 font-mono text-[11px] font-bold tracking-widest text-forge-lime">
                          {skill.files[activeFile - 1]?.path ?? "SKILL.md"} — RAW
                          SOURCE
                        </div>
                        <pre className="forge-scroll max-h-[540px] overflow-auto p-5 font-mono text-xs leading-relaxed text-forge-paper">
                          {[
                            { path: "SKILL.md", content: skill.skillMd },
                            ...skill.files,
                          ][activeFile]?.content}
                        </pre>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* download bar */}
                <div className="mt-8 border-4 border-forge-ink bg-forge-yellow p-4 hard-shadow sm:p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <p className="font-display text-lg sm:text-xl">
                      EXPORT PAYLOAD ↓
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleDownloadMd}
                        className="inline-flex items-center gap-2 border-[3px] border-forge-ink bg-forge-lime px-4 py-2.5 font-display text-sm shadow-[4px_4px_0_0_var(--color-forge-ink)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-forge-ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                      >
                        <FileText className="h-4 w-4" strokeWidth={2.5} /> .MD
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        className="inline-flex items-center gap-2 border-[3px] border-forge-ink bg-forge-paper px-4 py-2.5 font-display text-sm shadow-[4px_4px_0_0_var(--color-forge-ink)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-forge-ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                      >
                        <FileJson className="h-4 w-4" strokeWidth={2.5} /> .JSON
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadZip}
                        disabled={zipping}
                        className="inline-flex items-center gap-2 border-[3px] border-forge-ink bg-forge-orange px-4 py-2.5 font-display text-sm shadow-[4px_4px_0_0_var(--color-forge-ink)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-forge-ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50"
                      >
                        <FileArchive className="h-4 w-4" strokeWidth={2.5} />
                        {zipping ? "PRESSING…" : ".ZIP PACK"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAllZip}
                        disabled={zippingAll}
                        className="inline-flex items-center gap-2 border-[3px] border-forge-ink bg-forge-magenta px-4 py-2.5 font-display text-sm text-forge-paper shadow-[4px_4px_0_0_var(--color-forge-ink)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-forge-ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50"
                      >
                        <Package className="h-4 w-4" strokeWidth={2.5} />
                        {zippingAll ? "PRESSING…" : "ALL-IN-ONE .ZIP"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-2 border-[3px] border-forge-ink bg-forge-ink px-4 py-2.5 font-display text-sm text-forge-lime shadow-[4px_4px_0_0_var(--color-forge-magenta)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-forge-magenta)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                      >
                        {copied ? (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        ) : (
                          <Copy className="h-4 w-4" strokeWidth={2.5} />
                        )}
                        {copied ? "COPIED!" : "COPY MD"}
                      </button>
                    </div>
                    <p className="ml-auto hidden font-mono text-[10px] tracking-[0.25em] text-forge-ink/60 lg:block">
                      ALL-IN-ONE = MD + JSON + TXT + SCRIPTS · ONE ARCHIVE
                    </p>
                  </div>
                </div>

                {skill.files.length === 0 && (
                  <p className="mt-4 font-mono text-[11px] tracking-widest text-forge-ink/50">
                    NOTE: THIS FORGE RUN PRODUCED NO EXTRA REFERENCE FILES — THE
                    SKILL.MD CARRIES EVERYTHING.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ══════════ WORKFLOW PIPELINE ══════════ */}
        <section className="border-b-4 border-forge-ink bg-forge-magenta">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="font-display text-3xl text-forge-ink sm:text-4xl">
              {"// THE FORGE PIPELINE"}
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <div
                  key={step.n}
                  className={`border-4 border-forge-ink bg-forge-paper p-5 hard-shadow ${
                    i % 2 === 0 ? "-rotate-1" : "rotate-1"
                  } transition-transform hover:rotate-0`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-4xl text-forge-magenta">
                      {step.n}
                    </span>
                    <step.icon
                      className="h-7 w-7 text-forge-ink"
                      strokeWidth={2.2}
                    />
                  </div>
                  <h3 className="mt-4 font-display text-base leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-forge-ink/70">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ DEVELOPER ══════════ */}
        <section className="relative border-b-4 border-forge-ink bg-forge-ink text-forge-paper">
          <div aria-hidden className="stripes-hazard h-4 w-full border-b-4 border-forge-ink" />
          <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-16">
            <p className="font-mono text-[11px] font-black tracking-[0.4em] text-forge-lime">
              BEHIND THE HAMMER AND THE ANVIL
            </p>
            <h2 className="mt-4 font-display text-4xl leading-[0.95] sm:text-6xl">
              THE{" "}
              <span className="inline-block -rotate-1 border-4 border-forge-paper bg-forge-lime px-3 text-forge-ink shadow-[6px_6px_0_0_var(--color-forge-magenta)]">
                DEVELOPER
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl font-mono text-xs leading-relaxed tracking-widest text-forge-paper/70 sm:text-sm">
              ONE HUMAN. ZERO SLOP. CLICK THE BUTTON TO SUMMON HIM ONTO YOUR
              SCREEN AS A FLOATING AVATAR YOU CAN DRAG ANYWHERE.
            </p>
            <button
              type="button"
              onClick={() => setDevOpen(true)}
              className="mt-8 inline-flex items-center gap-3 border-4 border-forge-paper bg-forge-lime px-10 py-5 font-display text-xl text-forge-ink shadow-[8px_8px_0_0_var(--color-forge-orange)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[7px_7px_0_0_var(--color-forge-orange)] active:translate-x-[8px] active:translate-y-[8px] active:shadow-none sm:text-2xl"
            >
              <Hammer className="h-6 w-6" strokeWidth={2.5} />
              SUMMON: ROBERTH NAMOC
            </button>
            <AnimatePresence>
              {devOpen && (
                <p className="mx-auto mt-4 max-w-md font-mono text-[10px] tracking-[0.25em] text-forge-orange">
                  HE IS NOW FLOATING AROUND YOUR SCREEN. DRAG HIM. CLOSE HIM.
                  RESPECT HIM.
                </p>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* ══════════ FOOTER (sticks to bottom) ══════════ */}
      <footer className="mt-auto bg-forge-ink text-forge-paper">
        <Ticker
          items={[
            "ROBERTH NAMOC",
            "SKILL FOUNDRY™",
            "PROMPT IN → SKILL OUT",
            "EST. 2025",
            "NO SLOP WAS HARMED",
          ]}
          fast
          reverse
          className="border-b-4 bg-forge-orange text-forge-ink"
        />
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6">
          <p className="font-display text-base">
            SKILL FOUNDRY<span className="text-forge-orange">™</span>
          </p>
          <p className="font-mono text-[10px] tracking-[0.2em] text-forge-paper/60">
            © 2025 · FORGED BY <span className="text-forge-lime">ROBERTH NAMOC</span>{" "}
            · ALL SKILLS SHIP SLOP-FREE
          </p>
          <button
            type="button"
            onClick={() => setDevOpen(true)}
            className="font-mono text-[10px] font-bold tracking-[0.2em] underline decoration-2 underline-offset-4 hover:text-forge-lime"
          >
            SUMMON DEVELOPER
          </button>
        </div>
      </footer>

      {/* floating developer card */}
      <AnimatePresence>
        {devOpen && <FloatingDevCard onClose={() => setDevOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
