import JSZip from "jszip";
import { sanitizeSkill, buildJsonExport, safeRelPath } from "@/lib/skill-types";

export const runtime = "nodejs";

type ExportFormat = "pack" | "all";

function buildReadmeTxt(skill: NonNullable<ReturnType<typeof sanitizeSkill>>): string {
  const line = "=".repeat(64);
  const fileTree = [
    "SKILL.md          <- agent-ready skill (the one your agent reads)",
    "skill.json        <- full machine-readable export (skill-foundry/skill-pack@1)",
    "manifest.json     <- pack metadata",
    ...skill.files.map((f) => `${f.path.padEnd(18)}<- reference file`),
    "plaintext/…       <- plain-text mirror of every file (.txt)",
  ].join("\n");

  return `${line}
 SKILL FOUNDRY™ — ALL-IN-ONE PACKAGE
 ${skill.emoji} ${skill.title}
${line}

NAME       : ${skill.name}
TAGS       : ${skill.tags.join(", ") || "(none)"}
FORGED AT  : ${skill.generatedAt ?? new Date().toISOString()}
GENERATOR  : SKILL FOUNDRY™ by ROBERTH NAMOC

DESCRIPTION
-----------
${skill.description || "(no description)"}

WHEN TO USE
-----------
${skill.whenToUse || "(no trigger guidance)"}

PACKAGE CONTENTS
----------------
${fileTree}

HOW TO INSTALL (Claude Code / agent skills)
-------------------------------------------
1. Unzip this archive — everything stays inside the ${skill.name}/ folder.
2. Copy that folder into your skills directory (e.g. ~/.claude/skills/${skill.name}).
3. Your agent discovers SKILL.md automatically. No copy-paste needed.

Plain-text copies live in plaintext/ for humans, grep, and tools that
refuse to speak markdown. Scripts keep their original paths and
extensions (py / sh / js / …) so they stay executable.

Zero slop. Forge on. ⚒
`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { skill?: unknown; format?: string }
      | null;
    const skill = sanitizeSkill(body?.skill);
    const format: ExportFormat = body?.format === "all" ? "all" : "pack";

    if (!skill) {
      return Response.json(
        { error: "INVALID SKILL PAYLOAD — nothing to press." },
        { status: 400 }
      );
    }

    const zip = new JSZip();
    const root = zip.folder(skill.name);
    if (!root) {
      return Response.json(
        { error: "ZIP PRESS FAILED — could not create archive root." },
        { status: 500 }
      );
    }

    // ── core payload (both formats) ─────────────────────────────
    root.file("SKILL.md", skill.skillMd);
    for (const f of skill.files) {
      root.file(f.path, f.content);
    }
    root.file(
      "manifest.json",
      JSON.stringify(
        {
          schema: "skill-foundry/skill-pack@1",
          name: skill.name,
          title: skill.title,
          emoji: skill.emoji,
          description: skill.description,
          whenToUse: skill.whenToUse,
          tags: skill.tags,
          files: ["SKILL.md", ...skill.files.map((f) => f.path)],
          generatedAt: skill.generatedAt ?? new Date().toISOString(),
          generator: "SKILL FOUNDRY™ by ROBERTH NAMOC",
          format,
        },
        null,
        2
      )
    );

    // ── all-in-one extras: json export + plaintext mirror + readme ──
    if (format === "all") {
      root.file("skill.json", JSON.stringify(buildJsonExport(skill), null, 2));
      root.file("README.txt", buildReadmeTxt(skill));

      const plain = root.folder("plaintext");
      if (!plain) {
        return Response.json(
          { error: "ZIP PRESS FAILED — could not create plaintext mirror." },
          { status: 500 }
        );
      }
      const plainName = (p: string) =>
        `${p.replace(/\.(md|markdown)$/i, "")}.txt`;
      plain.file("SKILL.txt", skill.skillMd);
      for (const f of skill.files) {
        const p = safeRelPath(f.path);
        plain.file(plainName(p), f.content);
      }
    }

    const buf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    const safeName = skill.name.replace(/[^a-z0-9-]/g, "") || "skill";
    const filename =
      format === "all" ? `${safeName}-all-in-one.zip` : `${safeName}-skill-pack.zip`;

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/download] zip press failure:", err);
    return Response.json(
      { error: "ZIP PRESS FAILED — archive error." },
      { status: 500 }
    );
  }
}
