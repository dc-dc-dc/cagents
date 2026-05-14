import type { ParsedAgent, ParsedSkill, GeneratedFile } from "../parser";
import { formatParams } from "../parser";
import { resolveTools } from "../compat";

const MODEL_MAP: Record<string, string> = {
  haiku:  "gemini-2.0-flash",
  sonnet: "gemini-2.5-flash",
  opus:   "gemini-2.5-pro",
};

function geminiModel(model: string): string {
  return MODEL_MAP[model] ?? model;
}

export function generateGeminiAgentMarkdown(agent: ParsedAgent): string {
  const lines: string[] = [];
  const fm = agent.frontmatter;

  lines.push("---");
  lines.push(`name: ${agent.name}`);

  if (fm.description) lines.push(`description: "${fm.description}"`);
  if (fm.kind)        lines.push(`kind: ${fm.kind}`);
  if (fm.model)       lines.push(`model: ${geminiModel(fm.model)}`);

  if (fm.tools) {
    lines.push("tools:");
    for (const t of resolveTools(fm.tools, "gemini")) {
      lines.push(`  - ${t}`);
    }
  }

  if (fm.temperature) lines.push(`temperature: ${fm.temperature}`);
  // maxTurns → max_turns
  if (fm.maxTurns)    lines.push(`max_turns: ${fm.maxTurns}`);
  // timeoutMins → timeout_mins
  if (fm.timeoutMins) lines.push(`timeout_mins: ${fm.timeoutMins}`);

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

// Non-inline skills compile to .gemini/skills/<name>/SKILL.md
// Gemini auto-discovers skills — no explicit agent reference needed.
export function generateGeminiSkillMarkdown(skill: ParsedSkill): string {
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

export function generateGeminiFiles(agent: ParsedAgent): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: `.gemini/agents/${agent.name}.md`,
    content: generateGeminiAgentMarkdown(agent),
  });

  for (const skill of agent.skills) {
    if (!skill.inline) {
      files.push({
        path: `.gemini/skills/${skill.name}/SKILL.md`,
        content: generateGeminiSkillMarkdown(skill),
      });
    }
  }

  return files;
}
