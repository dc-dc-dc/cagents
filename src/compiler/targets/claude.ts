import type { ParsedAgent, ParsedSkill, GeneratedFile } from "../parser";
import { formatParams } from "../parser";
import { CLAUDE_OUTPUT_KEYS } from "../compat";

export const KNOWN_FRONTMATTER_KEYS = CLAUDE_OUTPUT_KEYS;

export function generateAgentFiles(agent: ParsedAgent): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: `.claude/agents/${agent.name}.md`, content: generateAgentMarkdown(agent) },
  ];
  for (const skill of agent.skills) {
    if (!skill.inline) {
      files.push({ path: `.claude/skills/${skill.name}.md`, content: generateSkillMarkdown(skill) });
    }
  }
  return files;
}

export function generateAgentMarkdown(agent: ParsedAgent): string {
  const lines: string[] = ["---", `name: ${agent.name}`];
  for (const key of KNOWN_FRONTMATTER_KEYS) {
    if (agent.frontmatter[key]) lines.push(`${key}: ${agent.frontmatter[key]}`);
  }
  lines.push("---", "");
  if (agent.systemPrompt) lines.push(agent.systemPrompt, "");

  const inlineSkills = agent.skills.filter((s) => s.inline);
  if (inlineSkills.length > 0) {
    lines.push("## Skills", "");
    for (const skill of inlineSkills) {
      lines.push(`### ${skill.name}`);
      const p = formatParams(skill.params);
      if (p) lines.push(`Parameters: ${p}`);
      lines.push("", skill.body, "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function generateSkillMarkdown(skill: ParsedSkill): string {
  const lines: string[] = ["---", `name: ${skill.name}`];
  const p = formatParams(skill.params);
  if (p) lines.push(`parameters: ${p}`);
  lines.push("---", "", skill.body, "");
  return lines.join("\n").trimEnd() + "\n";
}
