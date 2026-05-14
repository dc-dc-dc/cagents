import type { ParsedAgent, ParsedSkill, GeneratedFile } from "../parser";
import { formatParams } from "../parser";
import { resolveTools } from "../compat";

const MODEL_MAP: Record<string, string> = {
  sonnet: "claude-sonnet-4-5",
  haiku:  "claude-haiku-4-5",
  opus:   "claude-opus-4",
};

function kiroModel(model: string): string {
  return MODEL_MAP[model] ?? model;
}

export function generateKiroAgentMarkdown(agent: ParsedAgent): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`name: ${agent.name}`);

  if (agent.frontmatter.description) {
    lines.push(`description: ${agent.frontmatter.description}`);
  }

  if (agent.frontmatter.model) {
    lines.push(`model: ${kiroModel(agent.frontmatter.model)}`);
  }

  if (agent.frontmatter.tools) {
    lines.push("tools:");
    for (const t of resolveTools(agent.frontmatter.tools, "kiro")) {
      lines.push(`  - ${t}`);
    }
  }

  if (agent.frontmatter.allowedTools) {
    const allowed = resolveTools(agent.frontmatter.allowedTools, "kiro");
    lines.push("allowedTools:");
    for (const t of allowed) lines.push(`  - ${t}`);
  }

  if (agent.frontmatter.includeMcpJson === "true") {
    lines.push("includeMcpJson: true");
  }

  if (agent.frontmatter.welcomeMessage) {
    lines.push(`welcomeMessage: "${agent.frontmatter.welcomeMessage}"`);
  }

  lines.push("---");
  lines.push("");

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

// Non-inline skills compile to .kiro/skills/<name>/SKILL.md
// Kiro auto-discovers skills from .kiro/skills/ — no explicit agent reference needed.
export function generateKiroSkillMarkdown(skill: ParsedSkill): string {
  const lines: string[] = [];
  const paramStr = formatParams(skill.params);

  // Build a description Kiro can use for keyword matching / activation
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

export function generateKiroFiles(agent: ParsedAgent): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: `.kiro/agents/${agent.name}.md`,
    content: generateKiroAgentMarkdown(agent),
  });

  for (const skill of agent.skills) {
    if (!skill.inline) {
      files.push({
        // Kiro skill convention: .kiro/skills/<name>/SKILL.md
        path: `.kiro/skills/${skill.name}/SKILL.md`,
        content: generateKiroSkillMarkdown(skill),
      });
    }
  }

  return files;
}
