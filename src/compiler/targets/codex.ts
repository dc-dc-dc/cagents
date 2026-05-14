import type { ParsedAgent, ParsedSkill, GeneratedFile } from "../parser";
import { formatParams } from "../parser";

const MODEL_MAP: Record<string, string> = {
  haiku:  "codex-mini-latest",
  sonnet: "o4-mini",
  opus:   "o3",
};

function codexModel(model: string): string {
  return MODEL_MAP[model] ?? model;
}

// Codex reads AGENTS.md as project-level context — plain markdown, no YAML frontmatter.
// Model config is emitted as an HTML comment so Codex can parse it if needed.
export function generateCodexAgentMarkdown(agent: ParsedAgent): string {
  const lines: string[] = [];
  const fm = agent.frontmatter;

  lines.push(`# ${agent.name}`);
  lines.push("");

  if (fm.description) {
    lines.push(fm.description);
    lines.push("");
  }

  if (fm.model) {
    lines.push(`<!-- model: ${codexModel(fm.model)} -->`);
    lines.push("");
  }

  if (agent.systemPrompt) {
    lines.push(agent.systemPrompt);
    lines.push("");
  }

  const inlineSkills = agent.skills.filter((s) => s.inline);
  if (inlineSkills.length > 0) {
    lines.push("## Skills");
    lines.push("");
    for (const skill of inlineSkills) {
      lines.push(`### ${skill.name}`);
      const paramStr = formatParams(skill.params);
      if (paramStr) lines.push(`Parameters: ${paramStr}`);
      lines.push("");
      lines.push(skill.body);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

// Non-inline skills compile to .codex/skills/<name>/SKILL.md
// Codex auto-discovers skills from .codex/skills/ — no explicit agent reference needed.
export function generateCodexSkillMarkdown(skill: ParsedSkill): string {
  const lines: string[] = [];
  const paramStr = formatParams(skill.params);

  const firstLine = skill.body.split("\n").find((l) => l.trim()) ?? skill.name;
  const descParts = [firstLine.trim()];
  if (paramStr) descParts.push(`Parameters: ${paramStr}.`);
  const description = descParts.join(" ");

  lines.push("---");
  lines.push(`name: ${skill.name}`);
  lines.push(`description: "${description}"`);
  lines.push("---");
  lines.push("");

  if (paramStr) {
    lines.push(`Parameters: ${paramStr}`);
    lines.push("");
  }

  lines.push(skill.body);
  lines.push("");

  return lines.join("\n").trimEnd() + "\n";
}

export function generateCodexFiles(agent: ParsedAgent): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Codex reads AGENTS.md from the project root (or nearest ancestor directory).
  files.push({
    path: "AGENTS.md",
    content: generateCodexAgentMarkdown(agent),
  });

  for (const skill of agent.skills) {
    if (!skill.inline) {
      files.push({
        path: `.codex/skills/${skill.name}/SKILL.md`,
        content: generateCodexSkillMarkdown(skill),
      });
    }
  }

  return files;
}
