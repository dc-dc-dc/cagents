import type { ParsedSkill } from "./parser";

export const SKILLSSH_ALIAS = "skills.sh";

// ── Include scanner ───────────────────────────────────────────────────────────

const SKILLSSH_RE = /#include\s+<skills\.sh\/([^>\s]+)>/g;

/** Return all unique `owner/repo/skill-name` paths referenced in source(s). */
export function scanSkillsShIncludes(sources: string | string[]): string[] {
  const arr = Array.isArray(sources) ? sources : [sources];
  const seen = new Set<string>();
  for (const src of arr) {
    for (const m of src.matchAll(SKILLSSH_RE)) seen.add(m[1]!);
  }
  return [...seen];
}

// ── GitHub fetcher ────────────────────────────────────────────────────────────

/** Build the raw GitHub URL for a SKILL.md file.
 *  path = "owner/repo/skill-name"  →  "owner/repo" on branch, "skill-name/SKILL.md" */
function rawUrl(ownerRepo: string, branch: string, skillName: string): string {
  return `https://raw.githubusercontent.com/${ownerRepo}/${branch}/${skillName}/SKILL.md`;
}

/** Fetch SKILL.md content; tries `main` then `master`. Returns null on 404/error. */
export async function fetchSkillsMd(path: string): Promise<string | null> {
  const segments = path.split("/");
  if (segments.length < 3) return null;
  const ownerRepo = segments.slice(0, 2).join("/");
  const skillName = segments.slice(2).join("/");

  for (const branch of ["main", "master"]) {
    try {
      const res = await fetch(rawUrl(ownerRepo, branch, skillName));
      if (res.ok) return await res.text();
      if (res.status !== 404) break;
    } catch {
      break;
    }
  }
  return null;
}

// ── SKILL.md parser ───────────────────────────────────────────────────────────

/** Parse a SKILL.md file into a ParsedSkill, deriving name from path as fallback. */
export function parseSkillMd(path: string, content: string): ParsedSkill | null {
  // Derive fallback name from last path segment
  const fallbackName = path.split("/").pop() ?? "skill";

  // Parse optional YAML frontmatter
  let name = fallbackName;
  let body = content.trim();

  if (content.startsWith("---\n")) {
    const closeIdx = content.indexOf("\n---", 4);
    if (closeIdx !== -1) {
      const fm: Record<string, string> = {};
      for (const line of content.slice(4, closeIdx).split("\n")) {
        const m = line.match(/^([\w-]+):\s*(.+)$/);
        if (m) fm[m[1]!] = m[2]!.trim();
      }
      if (fm["name"]) name = fm["name"];
      const bodyStart = closeIdx + 4 + (content[closeIdx + 4] === "\n" ? 1 : 0);
      body = content.slice(bodyStart).trim();
    }
  }

  if (!body) return null;
  return { name, params: "", body, inline: false };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/** Scan sources for `#include <skills.sh/...>`, fetch + parse all SKILL.md files
 *  in parallel. Returns a map of `"owner/repo/skill-name"` → ParsedSkill. */
export async function fetchSkillsShPackages(
  sources: string | string[]
): Promise<Record<string, ParsedSkill>> {
  const paths = scanSkillsShIncludes(sources);
  if (paths.length === 0) return {};

  const results = await Promise.all(
    paths.map(async (path) => {
      const content = await fetchSkillsMd(path);
      if (!content) return [path, null] as const;
      const skill = parseSkillMd(path, content);
      return [path, skill] as const;
    })
  );

  const map: Record<string, ParsedSkill> = {};
  for (const [path, skill] of results) {
    if (skill) map[path] = skill;
  }
  return map;
}
