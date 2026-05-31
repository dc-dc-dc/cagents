import { describe, it, expect } from "bun:test";
import { scanSkillsShIncludes, parseSkillMd, fetchSkillsShPackages, SKILLSSH_ALIAS } from "./skillssh";
import { parseCAgent } from "./parser";

// ── scanSkillsShIncludes ──────────────────────────────────────────────────────

describe("scanSkillsShIncludes", () => {
  it("finds a single include", () => {
    const src = `#include <skills.sh/anthropics/skills/ts-expert>`;
    expect(scanSkillsShIncludes(src)).toEqual(["anthropics/skills/ts-expert"]);
  });

  it("finds multiple includes", () => {
    const src = [
      `#include <skills.sh/anthropics/skills/ts-expert>`,
      `#include <skills.sh/vercel-labs/skills/nextjs>`,
    ].join("\n");
    expect(scanSkillsShIncludes(src)).toEqual([
      "anthropics/skills/ts-expert",
      "vercel-labs/skills/nextjs",
    ]);
  });

  it("deduplicates repeated includes", () => {
    const src = [
      `#include <skills.sh/anthropics/skills/ts-expert>`,
      `#include <skills.sh/anthropics/skills/ts-expert>`,
    ].join("\n");
    expect(scanSkillsShIncludes(src)).toEqual(["anthropics/skills/ts-expert"]);
  });

  it("ignores regular repo includes", () => {
    const src = `#include <myorg/shared/helper>`;
    expect(scanSkillsShIncludes(src)).toEqual([]);
  });

  it("accepts an array of sources", () => {
    const sources = [
      `#include <skills.sh/a/b/c>`,
      `#include <skills.sh/d/e/f>`,
    ];
    expect(scanSkillsShIncludes(sources)).toEqual(["a/b/c", "d/e/f"]);
  });

  it("returns empty array when no includes", () => {
    expect(scanSkillsShIncludes("fn main() { hello }")).toEqual([]);
  });
});

// ── parseSkillMd ──────────────────────────────────────────────────────────────

describe("parseSkillMd", () => {
  it("parses full frontmatter + body", () => {
    const content = `---
name: ts-expert
description: TypeScript expertise
allowed-tools:
  - Read
---
You are a TypeScript expert.`;
    const skill = parseSkillMd("owner/repo/ts-expert", content);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("ts-expert");
    expect(skill!.body).toBe("You are a TypeScript expert.");
    expect(skill!.params).toBe("");
    expect(skill!.inline).toBe(false);
  });

  it("falls back to path segment when no name in frontmatter", () => {
    const content = `---
description: no name here
---
Body text.`;
    const skill = parseSkillMd("owner/repo/my-skill", content);
    expect(skill!.name).toBe("my-skill");
  });

  it("parses skill with no frontmatter at all", () => {
    const content = `Just some skill instructions.`;
    const skill = parseSkillMd("owner/repo/plain-skill", content);
    expect(skill!.name).toBe("plain-skill");
    expect(skill!.body).toBe("Just some skill instructions.");
  });

  it("returns null for empty body", () => {
    const content = `---
name: empty-skill
---
`;
    const skill = parseSkillMd("owner/repo/empty-skill", content);
    expect(skill).toBeNull();
  });

  it("trims body whitespace", () => {
    const content = `---
name: trimmed
---

  Some body content.

`;
    const skill = parseSkillMd("owner/repo/trimmed", content);
    expect(skill!.body).toBe("Some body content.");
  });
});

// ── SKILLSSH_ALIAS constant ───────────────────────────────────────────────────

describe("SKILLSSH_ALIAS", () => {
  it("is 'skills.sh'", () => {
    expect(SKILLSSH_ALIAS).toBe("skills.sh");
  });
});

// ── parser integration ────────────────────────────────────────────────────────

describe("parseCAgent with skillssh", () => {
  it("injects a skills.sh skill into the parsed agent", () => {
    const source = `
#def name test-agent

#include <skills.sh/anthropics/skills/ts-expert>

fn main() {
    You are helpful.
}
`;
    const skillssh = {
      "anthropics/skills/ts-expert": {
        name: "ts-expert",
        params: "",
        body: "You are a TypeScript expert.",
        inline: false,
      },
    };
    const agent = parseCAgent(source, {}, "test.ca", {}, skillssh);
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("ts-expert");
    expect(agent.skills[0]!.body).toBe("You are a TypeScript expert.");
  });

  it("emits a warning when a skills.sh include is missing", () => {
    const source = `
#def name test-agent
#include <skills.sh/owner/repo/missing-skill>
fn main() { hello }
`;
    const agent = parseCAgent(source, {}, "test.ca", {}, {});
    const warn = agent.warnings.find((w) => w.value.includes("missing-skill"));
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("not found");
  });

  it("does not duplicate a skill included twice", () => {
    const source = `
#def name test-agent
#include <skills.sh/a/b/skill>
#include <skills.sh/a/b/skill>
fn main() { hello }
`;
    const skillssh = {
      "a/b/skill": { name: "skill", params: "", body: "Skill body.", inline: false },
    };
    const agent = parseCAgent(source, {}, "test.ca", {}, skillssh);
    expect(agent.skills.filter((s) => s.name === "skill")).toHaveLength(1);
  });
});

// ── fetchSkillsShPackages (empty sources shortcut) ────────────────────────────

describe("fetchSkillsShPackages", () => {
  it("returns empty object when no includes present", async () => {
    const result = await fetchSkillsShPackages("fn main() { no includes here }");
    expect(result).toEqual({});
  });
});
