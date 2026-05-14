import { test, expect, describe } from "bun:test";
import { parseCAgent } from "../parser";
import { generateAgentMarkdown, generateSkillMarkdown, generateAgentFiles } from "./claude";

function parse(src: string) {
  return parseCAgent(src.trim() + "\n");
}

const MINIMAL = `
#def name my-agent

fn main() {
\tYou are a helpful assistant.
}
`;

const FULL = `
#def name reviewer
#def description Reviews code carefully
#def model sonnet
#def tools Read, Glob, Grep, Bash
#def permissionMode acceptEdits
#def background false
#def isolation light
#def memory true
#def color #4A9EFF
#def maxTurns 50
#def effort high

fn review(str file, int depth) {
\tReview the given file.
\tdepth controls thoroughness.
}

fn main() {
\tYou are a code reviewer.
\tBe direct.
}
`;

const WITH_SKILL_ONLY = `
#def name my-agent

fn greet(str name) {
\tSay hello to the user by name.
}

fn main() {
\tYou are a greeter.
}
`;

const WITH_INLINE_SKILL = `
#def name my-agent

#pragma inline
fn ping() {
\tRespond with pong.
}

fn main() {
\tYou are a test agent.
}
`;

const WITH_MULTI_SKILLS = `
#def name my-agent

fn search(str query) {
\tSearch for query.
}

fn summarize(str text, int words) {
\tSummarize text in words words.
}

fn main() {
\tYou are a research agent.
}
`;

describe("claude — output paths", () => {
  test("agent file goes to .claude/agents/<name>.md", () => {
    const files = generateAgentFiles(parse(MINIMAL));
    expect(files[0]!.path).toBe(".claude/agents/my-agent.md");
  });

  test("skill file goes to .claude/skills/<name>.md", () => {
    const files = generateAgentFiles(parse(WITH_SKILL_ONLY));
    const skill = files.find((f) => f.path.includes("skills"));
    expect(skill!.path).toBe(".claude/skills/greet.md");
  });

  test("inline skill does not produce a separate file", () => {
    const files = generateAgentFiles(parse(WITH_INLINE_SKILL));
    expect(files).toHaveLength(1);
  });

  test("two skills produce three files total", () => {
    const files = generateAgentFiles(parse(WITH_MULTI_SKILLS));
    expect(files).toHaveLength(3);
  });
});

describe("claude — agent frontmatter", () => {
  test("minimal agent has name and no extra fields", () => {
    const md = generateAgentMarkdown(parse(MINIMAL));
    expect(md).toContain("name: my-agent");
    expect(md).not.toContain("description:");
    expect(md).not.toContain("model:");
    expect(md).not.toContain("tools:");
  });

  test("description, model, tools are written in order", () => {
    const md = generateAgentMarkdown(parse(FULL));
    const descPos  = md.indexOf("description:");
    const modelPos = md.indexOf("model:");
    const toolsPos = md.indexOf("tools:");
    expect(descPos).toBeLessThan(modelPos);
    expect(modelPos).toBeLessThan(toolsPos);
  });

  test("model is written as-is (no mapping for claude)", () => {
    const md = generateAgentMarkdown(parse(FULL));
    expect(md).toContain("model: sonnet");
  });

  test("tools are written as a comma-separated string", () => {
    const md = generateAgentMarkdown(parse(FULL));
    expect(md).toContain("tools: Read, Glob, Grep, Bash");
  });

  test("effort and maxTurns are written when present", () => {
    const md = generateAgentMarkdown(parse(FULL));
    expect(md).toContain("effort: high");
    expect(md).toContain("maxTurns: 50");
  });

  test("permissionMode, background, isolation, memory, color are written", () => {
    const md = generateAgentMarkdown(parse(FULL));
    expect(md).toContain("permissionMode: acceptEdits");
    expect(md).toContain("background: false");
    expect(md).toContain("isolation: light");
    expect(md).toContain("memory: true");
    expect(md).toContain("color: #4A9EFF");
  });

  test("frontmatter is wrapped in --- delimiters", () => {
    const md = generateAgentMarkdown(parse(MINIMAL));
    const lines = md.split("\n");
    expect(lines[0]).toBe("---");
    const closingIdx = lines.indexOf("---", 1);
    expect(closingIdx).toBeGreaterThan(0);
  });
});

describe("claude — system prompt", () => {
  test("system prompt appears after closing ---", () => {
    const md = generateAgentMarkdown(parse(MINIMAL));
    const afterFrontmatter = md.split("---\n").slice(2).join("---\n");
    expect(afterFrontmatter.trim()).toContain("You are a helpful assistant.");
  });

  test("multi-line system prompt is preserved", () => {
    const md = generateAgentMarkdown(parse(FULL));
    expect(md).toContain("You are a code reviewer.");
    expect(md).toContain("Be direct.");
  });
});

describe("claude — skill file", () => {
  test("skill file has name in frontmatter", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("name: greet");
  });

  test("skill file has lowercase 'parameters' field", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("parameters: name (string)");
  });

  test("skill body appears after frontmatter", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("Say hello to the user by name.");
  });

  test("skill without params has no parameters field", () => {
    const agent = parse(WITH_INLINE_SKILL);
    const md = generateSkillMarkdown(agent.skills[0]!);
    expect(md).not.toContain("parameters:");
  });

  test("str→string, int→number type mapping", () => {
    const agent = parse(WITH_MULTI_SKILLS);
    const summarize = agent.skills.find((s) => s.name === "summarize")!;
    const md = generateSkillMarkdown(summarize);
    expect(md).toContain("parameters: text (string), words (number)");
  });
});

describe("claude — inline skill", () => {
  test("inline skill is embedded under ## Skills in agent file", () => {
    const md = generateAgentMarkdown(parse(WITH_INLINE_SKILL));
    expect(md).toContain("## Skills");
    expect(md).toContain("### ping");
    expect(md).toContain("Respond with pong.");
  });

  test("inline skill has no Parameters line when no params", () => {
    const md = generateAgentMarkdown(parse(WITH_INLINE_SKILL));
    const afterSkills = md.split("## Skills")[1]!;
    expect(afterSkills).not.toContain("Parameters:");
  });
});

describe("claude — output ends with newline", () => {
  test("agent file", () => {
    const files = generateAgentFiles(parse(MINIMAL));
    expect(files[0]!.content.endsWith("\n")).toBe(true);
  });

  test("skill file", () => {
    const files = generateAgentFiles(parse(WITH_SKILL_ONLY));
    const skill = files.find((f) => f.path.includes("skills"))!;
    expect(skill.content.endsWith("\n")).toBe(true);
  });
});
