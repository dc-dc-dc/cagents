import { test, expect, describe } from "bun:test";
import { parseCAgent } from "../parser";
import { generateCodexAgentMarkdown, generateCodexSkillMarkdown, generateCodexFiles } from "./codex";

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

describe("codex — output paths", () => {
  test("agent file is AGENTS.md at project root", () => {
    const files = generateCodexFiles(parse(MINIMAL));
    expect(files[0]!.path).toBe("AGENTS.md");
  });

  test("skill file goes to .codex/skills/<name>/SKILL.md", () => {
    const files = generateCodexFiles(parse(WITH_SKILL_ONLY));
    const skill = files.find((f) => f.path !== "AGENTS.md");
    expect(skill!.path).toBe(".codex/skills/greet/SKILL.md");
  });

  test("inline skill does not produce a separate file", () => {
    const files = generateCodexFiles(parse(WITH_INLINE_SKILL));
    expect(files).toHaveLength(1);
  });

  test("two skills produce three files: AGENTS.md + two skill files", () => {
    const files = generateCodexFiles(parse(WITH_MULTI_SKILLS));
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path)).toContain("AGENTS.md");
    expect(files.map((f) => f.path)).toContain(".codex/skills/search/SKILL.md");
    expect(files.map((f) => f.path)).toContain(".codex/skills/summarize/SKILL.md");
  });
});

describe("codex — AGENTS.md format", () => {
  test("starts with # <name> (no YAML frontmatter)", () => {
    const md = generateCodexAgentMarkdown(parse(MINIMAL));
    expect(md.startsWith("# my-agent\n")).toBe(true);
  });

  test("has no --- YAML delimiters", () => {
    const md = generateCodexAgentMarkdown(parse(FULL));
    expect(md).not.toContain("---");
  });

  test("description appears as a plain paragraph after the name", () => {
    const md = generateCodexAgentMarkdown(parse(FULL));
    expect(md).toContain("Reviews code carefully");
    expect(md).not.toContain("description:");
  });

  test("system prompt appears in the document body", () => {
    const md = generateCodexAgentMarkdown(parse(MINIMAL));
    expect(md).toContain("You are a helpful assistant.");
  });

  test("tools field is completely absent from output", () => {
    const md = generateCodexAgentMarkdown(parse(FULL));
    expect(md).not.toContain("tools:");
    expect(md).not.toContain("Read");
  });
});

describe("codex — model mapping", () => {
  test("haiku → codex-mini-latest in HTML comment", () => {
    const src = `#def name a\n#def model haiku\nfn main() {\n\tHello.\n}`;
    const md = generateCodexAgentMarkdown(parse(src));
    expect(md).toContain("<!-- model: codex-mini-latest -->");
  });

  test("sonnet → o4-mini in HTML comment", () => {
    const src = `#def name a\n#def model sonnet\nfn main() {\n\tHello.\n}`;
    const md = generateCodexAgentMarkdown(parse(src));
    expect(md).toContain("<!-- model: o4-mini -->");
  });

  test("opus → o3 in HTML comment", () => {
    const src = `#def name a\n#def model opus\nfn main() {\n\tHello.\n}`;
    const md = generateCodexAgentMarkdown(parse(src));
    expect(md).toContain("<!-- model: o3 -->");
  });

  test("no model → no HTML comment", () => {
    const md = generateCodexAgentMarkdown(parse(MINIMAL));
    expect(md).not.toContain("<!--");
  });

  test("model comment uses exact format <!-- model: <value> -->", () => {
    const src = `#def name a\n#def model sonnet\nfn main() {\n\tHello.\n}`;
    const md = generateCodexAgentMarkdown(parse(src));
    expect(md).toMatch(/<!-- model: o4-mini -->/);
  });
});

describe("codex — document section order", () => {
  test("order: # name → description → model comment → system prompt", () => {
    const src = `#def name a\n#def description An agent\n#def model sonnet\nfn main() {\n\tHello.\n}`;
    const md = generateCodexAgentMarkdown(parse(src));
    const namePos   = md.indexOf("# a");
    const descPos   = md.indexOf("An agent");
    const modelPos  = md.indexOf("<!-- model:");
    const promptPos = md.indexOf("Hello.");
    expect(namePos).toBeLessThan(descPos);
    expect(descPos).toBeLessThan(modelPos);
    expect(modelPos).toBeLessThan(promptPos);
  });
});

describe("codex — inline skill in AGENTS.md", () => {
  test("inline skill appears under ## Skills", () => {
    const md = generateCodexAgentMarkdown(parse(WITH_INLINE_SKILL));
    expect(md).toContain("## Skills");
    expect(md).toContain("### ping");
    expect(md).toContain("Respond with pong.");
  });
});

describe("codex — skill file", () => {
  test("skill file has YAML frontmatter with name and description", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateCodexSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("name: greet");
    expect(md).toContain('description: "Say hello to the user by name. Parameters: name (string)."');
  });

  test("skill file has Parameters line in body", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateCodexSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("Parameters: name (string)");
    expect(md).toContain("Say hello to the user by name.");
  });

  test("skill file ends with a newline", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateCodexSkillMarkdown(agent.skills[0]!);
    expect(md.endsWith("\n")).toBe(true);
  });
});

describe("codex — output ends with newline", () => {
  test("AGENTS.md", () => {
    const files = generateCodexFiles(parse(MINIMAL));
    expect(files[0]!.content.endsWith("\n")).toBe(true);
  });
});
