import JSZip from "jszip";
import { sanitizeSkill } from "@/lib/skill-types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { skill?: unknown }
      | null;
    const skill = sanitizeSkill(body?.skill);

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
        },
        null,
        2
      )
    );

    const buf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    const safeName = skill.name.replace(/[^a-z0-9-]/g, "") || "skill";
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}-skill-pack.zip"`,
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
