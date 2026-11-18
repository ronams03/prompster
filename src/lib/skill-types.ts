/**
 * SKILL FOUNDRY — shared skill schema + sanitizers.
 * Used by /api/generate (forge) and /api/download (zip press).
 */

export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillData {
  name: string;
  title: string;
  emoji: string;
  description: string;
  whenToUse: string;
  tags: string[];
  overview: string;
  skillMd: string;
  files: SkillFile[];
  generatedAt?: string;
}

export function slugify(input: string, fallback = "forged-skill"): string {
  const slug = String(input ?? "")
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Prevent path traversal; force clean relative posix paths. */
export function safeRelPath(input: string): string {
  return String(input ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/")
    .slice(0, 180);
}

function coerceString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function ensureFrontmatter(md: string, name: string, description: string): string {
  if (md.trimStart().startsWith("---")) return md;
  const desc = description.replace(/\s+/g, " ").trim().slice(0, 900);
  return `---\nname: ${name}\ndescription: ${desc}\n---\n\n${md}`;
}

/**
 * Validate + normalize an unknown LLM-shaped payload into a safe SkillData.
 * Returns null when the payload is fundamentally unusable.
 */
export function sanitizeSkill(raw: unknown): SkillData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const name = slugify(coerceString(obj.name));
  const title = coerceString(obj.title, name).trim().slice(0, 120) || name;
  const emoji = coerceString(obj.emoji, "⚡").trim().slice(0, 8) || "⚡";
  const description = coerceString(obj.description).trim().slice(0, 1024);
  const whenToUse = coerceString(obj.whenToUse).trim().slice(0, 1024);
  const overview = coerceString(obj.overview).trim().slice(0, 2000);
  const tags = Array.isArray(obj.tags)
    ? obj.tags
        .filter((t) => typeof t === "string" && t.trim())
        .map((t) => t.trim().toLowerCase().slice(0, 24))
        .slice(0, 6)
    : [];

  let skillMd = coerceString(obj.skillMd).trim();
  if (!skillMd) return null;
  skillMd = ensureFrontmatter(skillMd, name, description || title);

  const rawFiles = Array.isArray(obj.files) ? obj.files.slice(0, 6) : [];
  const files: SkillFile[] = [];
  for (const f of rawFiles) {
    if (!f || typeof f !== "object") continue;
    const fo = f as Record<string, unknown>;
    const path = safeRelPath(coerceString(fo.path));
    const content = coerceString(fo.content).slice(0, 20000);
    if (!path || !content.trim()) continue;
    if (files.some((x) => x.path === path)) continue;
    files.push({ path, content });
  }

  return {
    name,
    title,
    emoji,
    description,
    whenToUse,
    tags,
    overview,
    skillMd,
    files,
    generatedAt: coerceString(obj.generatedAt) || new Date().toISOString(),
  };
}

/** Parse the YAML frontmatter block out of SKILL.md (naive key/value split). */
export function splitFrontmatter(md: string): {
  fm: Array<{ key: string; value: string }>;
  body: string;
} {
  const match = md.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { fm: [], body: md };
  const body = md.slice(match[0].length);
  const fm: Array<{ key: string; value: string }> = [];
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    fm.push({
      key: line.slice(0, idx).trim(),
      value: line
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, ""),
    });
  }
  return { fm, body };
}

/** Build the JSON export payload for download. */
export function buildJsonExport(skill: SkillData): Record<string, unknown> {
  return {
    schema: "skill-foundry/skill-pack@1",
    name: skill.name,
    title: skill.title,
    emoji: skill.emoji,
    description: skill.description,
    whenToUse: skill.whenToUse,
    tags: skill.tags,
    overview: skill.overview,
    files: [{ path: "SKILL.md", content: skill.skillMd }, ...skill.files],
    generatedAt: skill.generatedAt ?? new Date().toISOString(),
    generator: {
      app: "SKILL FOUNDRY™",
      developer: "ROBERTH NAMOC",
    },
  };
}
