import type { ParsedAgent, ParsedSkill, GeneratedFile } from "../parser";
import { formatParams } from "../parser";

// The agent's system prompt maps to a Cursor rule (.cursor/rules/<name>.mdc).
// Rules with alwaysApply: true are injected into every agent session automatically.
export function generateCursorRuleMarkdown(agent: ParsedAgent): string {
  const lines: string[] = [];
  const fm = agent.frontmatter;

  lines.push("---");
  if (fm.description) {
    lines.push(`description: ${fm.description}`);
  }
  lines.push("alwaysApply: true");
  lines.push("---");
  lines.push("");

  // Cursor selects model per-session in the UI — note the preference as a comment.
  if (fm.model) {
    lines.push(`<!-- model: ${fm.model} -->`);
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

// Non-inline skills compile to .cursor/skills/<name>/SKILL.md.
// Cursor auto-discovers skills from .cursor/skills/ — invokable with /skill-name in chat.
export function generateCursorSkillMarkdown(skill: ParsedSkill): string {
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

export function generateCursorFiles(agent: ParsedAgent): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: `.cursor/rules/${agent.name}.mdc`,
    content: generateCursorRuleMarkdown(agent),
  });

  for (const skill of agent.skills) {
    if (!skill.inline) {
      files.push({
        path: `.cursor/skills/${skill.name}/SKILL.md`,
        content: generateCursorSkillMarkdown(skill),
      });
    }
  }

  return files;
}
