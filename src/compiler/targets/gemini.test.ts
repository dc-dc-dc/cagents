import { test, expect, describe } from "bun:test";
import { parseCAgent } from "../parser";
import { resolveTools } from "../compat";
import { generateGeminiAgentMarkdown, generateGeminiSkillMarkdown, generateGeminiFiles } from "./gemini";

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

describe("gemini — output paths", () => {
  test("agent file goes to .gemini/agents/<name>.md", () => {
    const files = generateGeminiFiles(parse(MINIMAL));
    expect(files[0]!.path).toBe(".gemini/agents/my-agent.md");
  });

  test("skill file goes to .gemini/skills/<name>/SKILL.md", () => {
    const files = generateGeminiFiles(parse(WITH_SKILL_ONLY));
    const skill = files.find((f) => f.path.includes("skills"));
    expect(skill!.path).toBe(".gemini/skills/greet/SKILL.md");
  });

  test("inline skill does not produce a separate file", () => {
    const files = generateGeminiFiles(parse(WITH_INLINE_SKILL));
    expect(files).toHaveLength(1);
  });
});

describe("gemini — model mapping", () => {
  test("haiku → gemini-2.0-flash", () => {
    const src = `#def name a\n#def model haiku\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("model: gemini-2.0-flash");
  });

  test("sonnet → gemini-2.5-flash", () => {
    const src = `#def name a\n#def model sonnet\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("model: gemini-2.5-flash");
  });

  test("opus → gemini-2.5-pro", () => {
    const src = `#def name a\n#def model opus\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("model: gemini-2.5-pro");
  });
});

describe("gemini — tool mapping", () => {
  test("Read → read_file", () => {
    const resolved = resolveTools("Read", "gemini");
    expect(resolved).toEqual(["read_file"]);
  });

  test("Bash → run_shell_command", () => {
    const resolved = resolveTools("Bash", "gemini");
    expect(resolved).toEqual(["run_shell_command"]);
  });

  test("WebSearch → google_search", () => {
    const resolved = resolveTools("WebSearch", "gemini");
    expect(resolved).toEqual(["google_search"]);
  });

  test("WebFetch → web_fetch", () => {
    const resolved = resolveTools("WebFetch", "gemini");
    expect(resolved).toEqual(["web_fetch"]);
  });

  test("TodoRead → empty string → omitted from tools list", () => {
    const resolved = resolveTools("TodoRead, TodoWrite", "gemini");
    expect(resolved).toEqual([]);
  });

  test("tools emitted as YAML list", () => {
    const src = `#def name a\n#def tools Read, Bash\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("tools:\n  - read_file\n  - run_shell_command");
  });

  test("Glob and LS both map to their unique Gemini names", () => {
    const resolved = resolveTools("Glob, LS", "gemini");
    expect(resolved).toContain("glob");
    expect(resolved).toContain("list_directory");
  });
});

describe("gemini — agent frontmatter fields", () => {
  test("description is written quoted", () => {
    const md = generateGeminiAgentMarkdown(parse(FULL));
    expect(md).toContain('description: "Reviews code carefully"');
  });

  test("maxTurns is emitted as max_turns", () => {
    const src = `#def name a\n#def maxTurns 30\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("max_turns: 30");
    expect(md).not.toContain("maxTurns:");
  });

  test("temperature is written as-is", () => {
    const src = `#def name a\n#def temperature 0.7\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("temperature: 0.7");
  });

  test("timeoutMins is emitted as timeout_mins", () => {
    const src = `#def name a\n#def timeoutMins 15\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("timeout_mins: 15");
    expect(md).not.toContain("timeoutMins:");
  });

  test("kind is written as-is", () => {
    const src = `#def name a\n#def kind local\nfn main() {\n\tHello.\n}`;
    const md = generateGeminiAgentMarkdown(parse(src));
    expect(md).toContain("kind: local");
  });

  test("unsupported fields absent: permissionMode, background, effort, color, isolation", () => {
    const md = generateGeminiAgentMarkdown(parse(FULL));
    expect(md).not.toContain("permissionMode:");
    expect(md).not.toContain("background:");
    expect(md).not.toContain("effort:");
    expect(md).not.toContain("color:");
    expect(md).not.toContain("isolation:");
  });

  test("frontmatter is wrapped in --- delimiters", () => {
    const md = generateGeminiAgentMarkdown(parse(MINIMAL));
    expect(md.startsWith("---\n")).toBe(true);
  });
});

describe("gemini — skill file", () => {
  test("skill description includes first body line and params", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateGeminiSkillMarkdown(agent.skills[0]!);
    expect(md).toContain('description: "Say hello to the user by name. Parameters: name (string)."');
  });

  test("skill body has Parameters line when params present", () => {
    const agent = parse(WITH_SKILL_ONLY);
    const md = generateGeminiSkillMarkdown(agent.skills[0]!);
    expect(md).toContain("Parameters: name (string)");
  });
});

describe("gemini — output ends with newline", () => {
  test("agent file", () => {
    const files = generateGeminiFiles(parse(MINIMAL));
    expect(files[0]!.content.endsWith("\n")).toBe(true);
  });
});
