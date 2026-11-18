import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { sanitizeSkill } from "@/lib/skill-types";

export const runtime = "nodejs";
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

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Forge a skill for this request:\n\n"""${prompt}"""\n\nRespond with the JSON object only.`,
        },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJsonObject(raw);
    const skill = parsed ? sanitizeSkill(parsed) : null;

    if (!skill) {
      return NextResponse.json(
        {
          error:
            "THE FOUNDRY JAMMED — the AI returned an unparsable payload. Try rephrasing the prompt and forge again.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ skill }, { status: 200 });
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
