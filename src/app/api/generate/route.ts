import { NextResponse } from "next/server";
import { sanitizeSkill } from "@/lib/skill-types";

export const runtime = "nodejs";
// Vercel Fluid compute: Hobby allows up to 300s, Pro up to 800s.
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are SKILL FOUNDRY — an elite AI agent-skill architect. You transform a user's raw idea into a production-grade "agent skill" package: a SKILL.md file plus supporting reference files (following the Claude/agent-skills convention).

Respond with ONLY one valid JSON object (no markdown fences, no commentary before or after) with exactly this shape:
{
  "name": "kebab-case-skill-name (lowercase, hyphens only, max 48 chars)",
  "title": "Short human-readable display title",
  "emoji": "one emoji representing the skill",
  "description": "One or two third-person sentences describing what it does and when to use it, e.g. 'Extracts structured line-items from PDF invoices and returns JSON. Use when the user asks to parse invoices, receipts, or billing documents.' Max 640 chars. This text goes into YAML frontmatter.",
  "whenToUse": "One sentence with concrete trigger conditions.",
  "tags": ["3-6 lowercase tags"],
  "overview": "2-3 sentences: what the skill does and why it matters.",
  "skillMd": "The COMPLETE SKILL.md file content. It MUST start with a YAML frontmatter block delimited by --- containing 'name' and 'description' fields. After the frontmatter include these markdown sections in order: '## Overview', '## When to Use This Skill', '## How It Works' (numbered workflow), '## Usage Examples' (at least 2 concrete examples, with code blocks where useful), '## Reference Files' (bullet list of the files array paths with one-line descriptions), '## Best Practices' (at least 5 bullets). Technical, precise, practical. Zero corporate fluff.",
  "files": [
    { "path": "reference/<topic>.md", "content": "supporting deep-dive: checklists, schemas, API notes, edge cases" },
    { "path": "scripts/<example>.py", "content": "small runnable helper script relevant to the skill (python, bash or typescript)" }
  ]
}

Hard rules:
- 1 to 2 files total; ALWAYS include at least one 'reference/*.md' file; each file content under 2500 characters.
- skillMd total length between 1500 and 3200 characters.
- All JSON string values must be properly escaped so the JSON parses (newlines as \\n, quotes as \\").
- Write the skill content in the same language as the user's request.
- Be extremely concrete and technical. No filler.`;

type ChatMessage = { role: "system" | "user"; content: string };

function buildMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Forge a skill for this request:\n\n"""${prompt}"""\n\nRespond with the JSON object only.`,
    },
  ];
}

function extractJsonObject(raw: string): unknown | null {
  let t = String(raw ?? "").trim();
  t = t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    /* keep trying */
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(t.slice(first, last + 1));
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null };
  }>;
}

/**
 * FREE PUBLIC API — no signup, no key. Works locally and on Vercel out of the box.
 * text.pollinations.ai speaks the OpenAI chat-completions protocol anonymously
 * (endpoint path is /openai). Streamed so bytes flow continuously and no
 * proxy/gateway can kill the connection during long generations.
 */
async function streamPollinations(
  messages: ChatMessage[],
  signal: AbortSignal,
  onChars: (total: number) => void
): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.POLLINATIONS_API_KEY
        ? { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      model: process.env.POLLINATIONS_MODEL || "openai",
      messages,
      temperature: 0.8,
      stream: true,
      response_format: { type: "json_object" },
      referrer: "skill-foundry",
      private: true,
    }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `pollinations POST ${res.status}${detail ? `: ${detail.slice(0, 140)}` : ""}`
    );
  }
  if (!res.body) throw new Error("pollinations returned no stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let reported = 0;

  const handleSseLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const chunk = JSON.parse(payload) as OpenAIStreamChunk;
      const delta = chunk?.choices?.[0]?.delta;
      const piece = delta?.content ?? "";
      if (typeof piece === "string" && piece) content += piece;
      // reasoning tokens also prove liveness — count them toward progress
      const thought = delta?.reasoning ?? "";
      const total = content.length + thought.length;
      if (total - reported >= 80) {
        reported = total;
        onChars(total);
      }
    } catch {
      /* partial chunk — ignore */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handleSseLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  if (buf.trim()) handleSseLine(buf);

  if (!content.trim()) throw new Error("pollinations stream produced no content");
  return content;
}

/** Second-chance keyless call via Pollinations' plain-text GET endpoint. */
const GET_SYSTEM_HINT =
  "You are SKILL FOUNDRY, an agent-skill architect. Reply with ONLY one valid minified JSON object with keys: name (kebab-case), title, emoji, description, whenToUse, tags (array), overview, skillMd (full SKILL.md with YAML frontmatter), files (array of {path, content}, include one reference/*.md). No prose, no markdown fences.";

async function callPollinationsGet(
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const model = encodeURIComponent(process.env.POLLINATIONS_MODEL || "openai");
  const url =
    `https://text.pollinations.ai/${encodeURIComponent(user)}` +
    `?model=${model}` +
    `&system=${encodeURIComponent(GET_SYSTEM_HINT)}` +
    `&referrer=skill-foundry&private=true`;
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) throw new Error(`pollinations GET ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("pollinations GET returned an empty body");
  return text;
}

/**
 * Sandbox-only fallback. Unavailable on Vercel — fails fast and quietly there.
 */
async function callZaiSdk(
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  interface ZaiLike {
    chat: {
      completions: {
        create: (args: {
          messages: ChatMessage[];
          thinking: { type: string };
        }) => Promise<OpenAIChatResponse>;
      };
    };
  }
  const mod = await import("z-ai-web-dev-sdk");
  const factory = (
    mod as unknown as { default: { create: (opts?: unknown) => Promise<ZaiLike> } }
  ).default;
  const zai = await factory.create();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });
  void signal;
  const content = completion.choices?.[0]?.message?.content ?? "";
  if (!String(content).trim()) throw new Error("z-ai SDK returned an empty completion");
  return String(content);
}

/** OpenAI-compatible provider used when the operator brings their own key. */
async function callOpenAICompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: 0.8,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `provider ${res.status}${detail ? `: ${detail.slice(0, 140)}` : ""}`
    );
  }
  const data = (await res.json()) as OpenAIChatResponse;
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!String(content).trim()) throw new Error("provider returned an empty completion");
  return String(content);
}

interface Provider {
  name: string;
  run: (signal: AbortSignal, onChars: (total: number) => void) => Promise<string>;
}

function buildProviders(messages: ChatMessage[]): Provider[] {
  const providers: Provider[] = [];

  // 1) OPTIONAL bring-your-own key (set as env vars on Vercel for higher quality).
  const keySources: Array<{
    env: string;
    baseUrl: string;
    fallbackModel: string;
    modelEnv: string;
  }> = [
    {
      env: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      fallbackModel: "gpt-4o-mini",
      modelEnv: "OPENAI_MODEL",
    },
    {
      env: "OPENROUTER_API_KEY",
      baseUrl: "https://openrouter.ai/api/v1",
      fallbackModel: "openai/gpt-4o-mini",
      modelEnv: "OPENROUTER_MODEL",
    },
    {
      env: "GROQ_API_KEY",
      baseUrl: "https://api.groq.com/openai/v1",
      fallbackModel: "llama-3.3-70b-versatile",
      modelEnv: "GROQ_MODEL",
    },
  ];
  for (const src of keySources) {
    const apiKey = process.env[src.env];
    if (apiKey) {
      const model = process.env[src.modelEnv] || src.fallbackModel;
      providers.push({
        name: src.env,
        run: (signal) =>
          callOpenAICompatible({ baseUrl: src.baseUrl, apiKey, model, messages, signal }),
      });
    }
  }

  // 2) Free public keyless API — the default engine everywhere (incl. Vercel).
  providers.push({
    name: "pollinations",
    run: (signal, onChars) => streamPollinations(messages, signal, onChars),
  });
  providers.push({
    name: "pollinations-get",
    run: (signal) => callPollinationsGet(messages, signal),
  });

  // 3) Last-resort sandbox SDK.
  providers.push({ name: "z-ai-sdk", run: (signal) => callZaiSdk(messages, signal) });

  return providers;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { prompt?: unknown }
    | null;
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "PROMPT REQUIRED — the forge does not run on air." },
      { status: 400 }
    );
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "PROMPT TOO LONG — max 2000 characters." },
      { status: 400 }
    );
  }

  const messages = buildMessages(prompt);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (evt: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(evt)}\n`));
        } catch {
          closed = true;
        }
      };
      // heartbeat: bytes hit the wire every 2.5s so idle-timeout proxies never
      // declare the link dead during long generations
      const pinger = setInterval(() => send({ t: "ping", at: Date.now() }), 2500);

      try {
        // client gone or 180s hard ceiling — either way stop the upstream work
        const signal = AbortSignal.any([
          req.signal,
          AbortSignal.timeout(180_000),
        ]);
        const providers = buildProviders(messages);
        const failures: string[] = [];

        for (const provider of providers) {
          if (closed) return;
          try {
            const raw = await provider.run(signal, (chars) =>
              send({ t: "progress", chars })
            );
            const parsed = extractJsonObject(raw);
            const skill = parsed ? sanitizeSkill(parsed) : null;
            if (skill) {
              send({ t: "done", skill, engine: provider.name });
              return;
            }
            failures.push(`${provider.name}: unparsable JSON payload`);
            console.error(`[/api/generate] ${provider.name}: unparsable JSON payload`);
          } catch (err) {
            if (signal.aborted) return;
            const msg = err instanceof Error ? err.message : String(err);
            failures.push(`${provider.name}: ${msg.slice(0, 140)}`);
            console.error(`[/api/generate] ${provider.name} failed:`, msg);
          }
        }

        send({
          t: "error",
          error:
            "THE FOUNDRY JAMMED — every AI engine failed or returned garbage. Give it a breath and strike again.",
          engines: failures,
        });
      } catch (err) {
        console.error("[/api/generate] forge failure:", err);
        send({
          t: "error",
          error:
            "FORGE OVERHEATED — the AI worker failed to respond. Wait a moment and strike again.",
        });
      } finally {
        clearInterval(pinger);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      // client disconnects are propagated via req.signal into upstream fetches
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
