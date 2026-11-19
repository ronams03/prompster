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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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

async function callOpenAICompatible(opts: {
  baseUrl: string;
  path?: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}${opts.path || "/chat/completions"}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: 0.8,
      ...opts.extraBody,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 110_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `provider ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`
    );
  }
  const data = (await res.json()) as OpenAIChatResponse;
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!String(content).trim()) {
    throw new Error("provider returned an empty completion");
  }
  return String(content);
}

/**
 * FREE PUBLIC API — no signup, no key. Works locally and on Vercel out of the box.
 * text.pollinations.ai speaks the OpenAI chat-completions protocol anonymously
 * (endpoint path is /openai, not /chat/completions).
 */
async function callPollinationsPost(
  messages: ChatMessage[],
  allowRateLimitWait = true
): Promise<string> {
  try {
    return await callOpenAICompatible({
      baseUrl: "https://text.pollinations.ai",
      path: "/openai",
      apiKey: process.env.POLLINATIONS_API_KEY,
      model: process.env.POLLINATIONS_MODEL || "openai",
      messages,
      extraBody: { referrer: "skill-foundry", private: true, max_tokens: 8192 },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Anonymous tier: "1 reply every 45 seconds per IP". Wait out the window once.
    if (allowRateLimitWait && msg.includes("402") && msg.includes("FREE_LIMIT")) {
      await new Promise((r) => setTimeout(r, 46_000));
      return callPollinationsPost(messages, false);
    }
    throw e;
  }
}

/** Second-chance keyless call via Pollinations' plain-text GET endpoint. */
const GET_SYSTEM_HINT =
  "You are SKILL FOUNDRY, an agent-skill architect. Reply with ONLY one valid minified JSON object with keys: name (kebab-case), title, emoji, description, whenToUse, tags (array), overview, skillMd (full SKILL.md with YAML frontmatter), files (array of {path, content}, include one reference/*.md). No prose, no markdown fences.";

async function callPollinationsGet(messages: ChatMessage[]): Promise<string> {
  // Always forge from the ORIGINAL user prompt (ignore nudge traffic).
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const model = encodeURIComponent(process.env.POLLINATIONS_MODEL || "openai");
  const url =
    `https://text.pollinations.ai/${encodeURIComponent(user)}` +
    `?model=${model}` +
    `&system=${encodeURIComponent(GET_SYSTEM_HINT)}` +
    `&referrer=skill-foundry&private=true`;
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`pollinations GET ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("pollinations GET returned an empty body");
  return text;
}

/**
 * Sandbox-only fallback. Unavailable on Vercel — fails fast and quietly there.
 */
async function callZaiSdk(messages: ChatMessage[]): Promise<string> {
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
  const factory = (mod as unknown as { default: { create: () => Promise<ZaiLike> } })
    .default;
  const zai = await factory.create();
  const completion = await Promise.race([
    zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    }),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("z-ai SDK timeout")), 45_000)
    ),
  ]);
  const content = completion.choices?.[0]?.message?.content ?? "";
  if (!String(content).trim()) throw new Error("z-ai SDK returned an empty completion");
  return String(content);
}

interface Provider {
  name: string;
  run: (messages: ChatMessage[]) => Promise<string>;
}

function buildProviders(): Provider[] {
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
        run: (messages) =>
          callOpenAICompatible({ baseUrl: src.baseUrl, apiKey, model, messages }),
      });
    }
  }

  // 2) Free public keyless API — the default engine everywhere (incl. Vercel).
  providers.push({
    name: "pollinations",
    run: (messages) => callPollinationsPost(messages),
  });
  providers.push({
    name: "pollinations-get",
    run: (messages) => callPollinationsGet(messages),
  });

  // 3) Last-resort sandbox SDK.
  providers.push({ name: "z-ai-sdk", run: (messages) => callZaiSdk(messages) });

  return providers;
}

/**
 * Run a provider; if it replies but the payload won't parse as JSON, retry once
 * with a correction nudge (the model sees its own bad output and fixes it).
 */
async function runWithJsonNudge(
  provider: Provider,
  messages: ChatMessage[]
): Promise<{ parsed: unknown | null; error?: string }> {
  try {
    let raw = await provider.run(messages);
    let parsed = extractJsonObject(raw);
    if (parsed) return { parsed };

    const nudged: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: raw.slice(0, 10_000) },
      {
        role: "user",
        content:
          "Your response above was NOT valid JSON — it could not be parsed. Rebuild the exact same skill as ONE valid JSON object. Output ONLY the JSON object: no prose, no markdown fences, all strings properly escaped.",
      },
    ];
    raw = await provider.run(nudged);
    parsed = extractJsonObject(raw);
    return { parsed };
  } catch (err) {
    return {
      parsed: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(req: Request) {
  try {
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
    const providers = buildProviders();
    const failures: string[] = [];

    for (const provider of providers) {
      const { parsed, error } = await runWithJsonNudge(provider, messages);
      const skill = parsed ? sanitizeSkill(parsed) : null;
      if (skill) {
        return NextResponse.json(
          { skill, engine: provider.name },
          { status: 200 }
        );
      }
      const why = error
        ? `${provider.name}: ${error.slice(0, 140)}`
        : `${provider.name}: unparsable JSON payload`;
      failures.push(why);
      console.error(`[/api/generate] ${why}`);
    }

    return NextResponse.json(
      {
        error:
          "THE FOUNDRY JAMMED — every AI engine failed or returned garbage. Give it a breath and strike again.",
        engines: failures,
      },
      { status: 502 }
    );
  } catch (err) {
    console.error("[/api/generate] forge failure:", err);
    return NextResponse.json(
      {
        error:
          "FORGE OVERHEATED — the AI worker failed to respond. Wait a moment and strike again.",
      },
      { status: 500 }
    );
  }
}
