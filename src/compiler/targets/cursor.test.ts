import { test, expect, describe } from "bun:test";
import { parseCAgent } from "../parser";
import { generateCursorRuleMarkdown, generateCursorSkillMarkdown, generateCursorFiles } from "./cursor";

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

describe("cursor — output paths", () => {
  test("rule file goes to .cursor/rules/<name>.mdc", () => {
    const files = generateCursorFiles(parse(MINIMAL));
    expect(files[0]!.path).toBe(".cursor/rules/my-agent.mdc");
  });

  test("skill file goes to .cursor/skills/<name>/SKILL.md", () => {
    const files = generateCursorFiles(parse(WITH_SKILL_ONLY));
    const skill = files.find((f) => !f.path.endsWith(".mdc"));
    expect(skill!.path).toBe(".cursor/skills/greet/SKILL.md");
  });

  test("inline skill does not produce a separate file", () => {
    const files = generateCursorFiles(parse(WITH_INLINE_SKILL));
    expect(files).toHaveLength(1);
  });

  test("two skills produce three files: rule + two skill files", () => {
    const files = generateCursorFiles(parse(WITH_MULTI_SKILLS));
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path)).toContain(".cursor/rules/my-agent.mdc");
    expect(files.map((f) => f.path)).toContain(".cursor/skills/search/SKILL.md");
    expect(files.map((f) => f.path)).toContain(".cursor/skills/summarize/SKILL.md");
  });
});

describe("cursor — rule file format", () => {
  test("rule file has YAML frontmatter delimiters", () => {
    const md = generateCursorRuleMarkdown(parse(MINIMAL));
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("\n---\n");
  });

  test("frontmatter includes alwaysApply: true", () => {
    const md = generateCursorRuleMarkdown(parse(MINIMAL));
    expect(md).toContain("alwaysApply: true");
  });

  test("description is written to frontmatter", () => {
    const md = generateCursorRuleMarkdown(parse(FULL));
    expect(md).toContain("description: Reviews code carefully");
  });

  test("no description field when not specified", () => {
    const md = generateCursorRuleMarkdown(parse(MINIMAL));
    expect(md).not.toContain("description:");
  });

  test("system prompt appears in the document body", () => {
    const md = generateCursorRuleMarkdown(parse(MINIMAL));
    expect(md).toContain("You are a helpful assistant.");
  });

  test("tools field is not written to rule file", () => {
    const md = generateCursorRuleMarkdown(parse(FULL));
    expect(md).not.toContain("tools:");
    expect(md).not.toContain("Read");
  });
});

describe("cursor — model handling", () => {
  test("model is emitted as an HTML comment (not in YAML frontmatter)", () => {
    const src = `#def name a\n#def model sonnet\nfn main() {\n\tHello.\n}`;
    const md = generateCursorRuleMarkdown(parse(src));
    expect(md).toContain("<!-- model: sonnet -->");
    expect(md).not.toContain("model: sonnet\n");
  });

  test("model comment uses the raw c-agents value without mapping", () => {
    const src = `#def name a\n#def model haiku\nfn main() {\n\tHello.\n}`;
    const md = generateCursorRuleMarkdown(parse(src));
    expect(md).toContain("<!-- model: haiku -->");
  });

  test("no model comment when model is not specified", () => {
    const md = generateCursorRuleMarkdown(parse(MINIMAL));
    expect(md).not.toContain("<!--");
  });

  test("model comment appears after frontmatter, before system prompt", () => {
    const src = `#def name a\n#def model opus\nfn main() {\n\tHello.\n}`;
    const md = generateCursorRuleMarkdown(parse(src));
    const fmEnd  = md.indexOf("\n---\n") + 5;
    const model  = md.indexOf("<!-- model:");
    const prompt = md.indexOf("Hello.");
    expect(fmEnd).toBeLessThan(model);
    expect(model).toBeLessThan(prompt);
  });
});

describe("cursor — inline skill in rule file", () => {
  test("inline skill appears under ## Skills", () => {
    const md = generateCursorRuleMarkdown(parse(WITH_INLINE_SKILL));
    expect(md).toContain("## Skills");
    expect(md).toContain("### ping");
    expect(md).toContain("Respond with pong.");
  });
});

describe("cursor — skill file format", () => {
  test("skill file has YAML frontmatter with name and description", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateCursorSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("name: greet");
    expect(md).toContain('description: "Say hello to the user by name. Parameters: name (string)."');
  });

  test("skill file has Parameters line in body", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateCursorSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("Parameters: name (string)");
    expect(md).toContain("Say hello to the user by name.");
  });

  test("skill file ends with a newline", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateCursorSkillMarkdown(agent.skills[0]!);
    expect(md.endsWith("\n")).toBe(true);
  });
});

describe("cursor — output ends with newline", () => {
  test("rule file ends with newline", () => {
    const files = generateCursorFiles(parse(MINIMAL));
    expect(files[0]!.content.endsWith("\n")).toBe(true);
  });
});
