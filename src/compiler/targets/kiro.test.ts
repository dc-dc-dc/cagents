import { test, expect, describe } from "bun:test";
import { parseCAgent } from "../parser";
import { resolveTools } from "../compat";
import { generateKiroAgentMarkdown, generateKiroSkillMarkdown, generateKiroFiles } from "./kiro";

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

describe("kiro — output paths", () => {
  test("agent file goes to .kiro/agents/<name>.md", () => {
    const files = generateKiroFiles(parse(MINIMAL));
    expect(files[0]!.path).toBe(".kiro/agents/my-agent.md");
  });

  test("skill file goes to .kiro/skills/<name>/SKILL.md", () => {
    const files = generateKiroFiles(parse(WITH_SKILL_ONLY));
    const skill = files.find((f) => f.path !== `.kiro/agents/my-agent.md`);
    expect(skill!.path).toBe(".kiro/skills/greet/SKILL.md");
  });

  test("inline skill does not produce a separate file", () => {
    const files = generateKiroFiles(parse(WITH_INLINE_SKILL));
    expect(files).toHaveLength(1);
  });
});

describe("kiro — model mapping", () => {
  test("haiku → claude-haiku-4-5", () => {
    const src = `#def name a\n#def model haiku\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("model: claude-haiku-4-5");
  });

  test("sonnet → claude-sonnet-4-5", () => {
    const src = `#def name a\n#def model sonnet\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("model: claude-sonnet-4-5");
  });

  test("opus → claude-opus-4", () => {
    const src = `#def name a\n#def model opus\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("model: claude-opus-4");
  });

  test("unknown model passes through unchanged", () => {
    const src = `#def name a\n#def model custom-model\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("model: custom-model");
  });
});

describe("kiro — tool mapping", () => {
  test("Read, Glob, Grep → deduplicated to single 'read' entry", () => {
    const resolved = resolveTools("Read, Glob, Grep", "kiro");
    expect(resolved).toEqual(["read"]);
  });

  test("Bash → shell", () => {
    const resolved = resolveTools("Bash", "kiro");
    expect(resolved).toEqual(["shell"]);
  });

  test("WebSearch → web", () => {
    const resolved = resolveTools("WebSearch", "kiro");
    expect(resolved).toEqual(["web"]);
  });

  test("TodoRead, TodoWrite → spec", () => {
    const resolved = resolveTools("TodoRead, TodoWrite", "kiro");
    expect(resolved).toEqual(["spec"]);
  });

  test("tools emitted as YAML list with two-space indent", () => {
    const src = `#def name a\n#def tools Read, Bash\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("tools:\n  - read\n  - shell");
  });
});

describe("kiro — agent frontmatter fields", () => {
  test("description is written when present", () => {
    const md = generateKiroAgentMarkdown(parse(FULL));
    expect(md).toContain("description: Reviews code carefully");
  });

  test("allowedTools emitted as YAML list", () => {
    const src = `#def name a\n#def allowedTools Read, Glob\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("allowedTools:\n  - read");
  });

  test("includeMcpJson: true is written when set to true", () => {
    const src = `#def name a\n#def includeMcpJson true\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain("includeMcpJson: true");
  });

  test("includeMcpJson: false is NOT written", () => {
    const src = `#def name a\n#def includeMcpJson false\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).not.toContain("includeMcpJson");
  });

  test("welcomeMessage is written in double quotes", () => {
    const src = `#def name a\n#def welcomeMessage Ready to review.\nfn main() {\n\tHello.\n}`;
    const md = generateKiroAgentMarkdown(parse(src));
    expect(md).toContain('welcomeMessage: "Ready to review."');
  });

  test("unsupported fields are absent: effort, maxTurns, permissionMode, background, color", () => {
    const md = generateKiroAgentMarkdown(parse(FULL));
    expect(md).not.toContain("effort:");
    expect(md).not.toContain("maxTurns:");
    expect(md).not.toContain("permissionMode:");
    expect(md).not.toContain("background:");
    expect(md).not.toContain("color:");
  });
});

describe("kiro — skill file", () => {
  test("skill description appends params when present", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateKiroSkillMarkdown(agent.skills[0]!);
    expect(md).toContain('description: "Say hello to the user by name. Parameters: name (string)."');
  });

  test("Parameters line appears in body before the body content", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateKiroSkillMarkdown(agent.skills[0]!);
    const paramsPos = md.indexOf("Parameters: name (string)");
    const bodyPos   = md.indexOf("Say hello to the user by name.", paramsPos + 1);
    expect(paramsPos).toBeLessThan(bodyPos);
  });

  test("skill without params has no Parameters line in body", () => {
    const src = `#def name a\nfn ping() {\n\tPong.\n}\nfn main() {\n\tHello.\n}`;
    const agent = parse(src);
    const md = generateKiroSkillMarkdown(agent.skills[0]!);
    const afterFm = md.split("---\n").slice(2).join("---\n");
    expect(afterFm.trim()).not.toContain("Parameters:");
  });
});

describe("kiro — output ends with newline", () => {
  test("agent file", () => {
    const files = generateKiroFiles(parse(MINIMAL));
    expect(files[0]!.content.endsWith("\n")).toBe(true);
  });
});
