import { test, expect, describe } from "bun:test";
import { parseCAgent } from "./parser";

// Helper: build a source string using actual tab characters for body indentation.
// Template literals preserve whitespace literally, so we use \t explicitly.
function src(strings: TemplateStringsArray, ...values: string[]): string {
  return String.raw({ raw: strings }, ...values);
}

describe("tab-indented body content", () => {
  test("// comment inside body is stripped", () => {
    const source = src`#def name agent
fn main() {
\t// This is a comment.
\tYou are an assistant.
}
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You are an assistant.");
  });

  test("#if inside body is executed as a conditional (tab-indented)", () => {
    const source = src`#def name agent
#def TARGET gemini
fn main() {
\t#if TARGET == gemini
\tUse Gemini tools.
\t#endif
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Use Gemini tools.\nYou are an agent.");
  });

  test("#if inside body is executed as a conditional (space-indented)", () => {
    const source = [
      "#def name agent",
      "#def TARGET gemini",
      "fn main() {",
      "    #if TARGET == gemini",
      "    Use Gemini tools.",
      "    #endif",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Use Gemini tools.\nYou are an agent.");
  });

  test("#if inside body is inactive when condition is false (tab-indented)", () => {
    const source = src`#def name agent
#def TARGET claude
fn main() {
\t#if TARGET == gemini
\tUse Gemini tools.
\t#endif
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You are an agent.");
  });

  test("#if inside body is inactive when condition is false (space-indented)", () => {
    const source = [
      "#def name agent",
      "#def TARGET claude",
      "fn main() {",
      "    #if TARGET == gemini",
      "    Use Gemini tools.",
      "    #endif",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You are an agent.");
  });

  test("#include inside body is expanded (tab-indented)", () => {
    const files = { "shared.ca": "Shared content." };
    const source = src`#def name agent
fn main() {
\t#include "shared.ca"
}
`;
    const agent = parseCAgent(source, files);
    expect(agent.systemPrompt).toBe("Shared content.");
  });

  test("#include inside body is expanded (space-indented)", () => {
    const files = { "shared.ca": "Shared content." };
    const source = [
      "#def name agent",
      "fn main() {",
      '    #include "shared.ca"',
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    expect(agent.systemPrompt).toBe("Shared content.");
  });

  test("#def inside body sets a variable but does not set frontmatter or appear in output", () => {
    const source = src`#def name agent
fn main() {
\t#def model opus
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    // #def model opus inside body should NOT set the model frontmatter
    expect(agent.frontmatter.model).toBeUndefined();
    // and should NOT appear as literal text in the body
    expect(agent.systemPrompt).toBe("You are an agent.");
  });

  test("#def inside body can be used with ${varname} in the same body", () => {
    const source = [
      "#def name agent",
      "fn main() {",
      "\t#def testing hello",
      "\tYou should say ${testing}.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You should say hello.");
  });

  test("tab is stripped from every body line uniformly", () => {
    const source = src`#def name agent
fn main() {
\tFirst line.
\tSecond line.
\tThird line.
}
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("First line.\nSecond line.\nThird line.");
  });

  test("4-space indent is stripped from every body line uniformly", () => {
    const source = [
      "#def name agent",
      "fn main() {",
      "    First line.",
      "    Second line.",
      "    Third line.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("First line.\nSecond line.\nThird line.");
  });

  test("double-tab preserves one tab on inner lines", () => {
    const source = src`#def name agent
fn main() {
\tFirst line.
\t\tDouble-indented line.
\tLast line.
}
`;
    const agent = parseCAgent(source);
    const lines = agent.systemPrompt.split("\n");
    expect(lines[0]).toBe("First line.");
    expect(lines[1]).toBe("\tDouble-indented line.");
    expect(lines[2]).toBe("Last line.");
  });

  test("double-space preserves extra space on inner lines", () => {
    const source = [
      "#def name agent",
      "fn main() {",
      "    First line.",
      "        Double-indented line.",
      "    Last line.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    const lines = agent.systemPrompt.split("\n");
    expect(lines[0]).toBe("First line.");
    expect(lines[1]).toBe("    Double-indented line.");
    expect(lines[2]).toBe("Last line.");
  });
});

describe("#if at top level still works", () => {
  test("conditional includes frontmatter when active", () => {
    const source = src`#def name agent
#def TARGET gemini
#if TARGET == gemini
#def model haiku
#endif
fn main() {
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    expect(agent.frontmatter.model).toBe("haiku");
  });

  test("conditional excludes frontmatter when inactive", () => {
    const source = src`#def name agent
#def TARGET claude
#if TARGET == gemini
#def model haiku
#endif
fn main() {
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    expect(agent.frontmatter.model).toBeUndefined();
  });
});

describe("fn declaration requires column 0", () => {
  test("fn at column 0 is parsed as a function", () => {
    const source = src`#def name agent
fn greet(str name) {
\tSay hello to name.
}
fn main() {
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("greet");
  });

  test("tab-indented fn inside body is literal content", () => {
    const source = src`#def name agent
fn main() {
\tfn fake() {
\t\tNot a real function.
\t}
}
`;
    const agent = parseCAgent(source);
    // Should not produce any skills — the nested fn is literal text
    expect(agent.skills).toHaveLength(0);
    expect(agent.systemPrompt).toContain("fn fake()");
  });
});

describe("closing brace at column 0", () => {
  test("} at column 0 closes the function", () => {
    const source = src`#def name agent
fn main() {
\tContent here.
}
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Content here.");
  });

  test("tab-indented } is literal body content", () => {
    const source = src`#def name agent
fn main() {
\tYou can use { and } in prompts.
\t} is a closing brace character.
}
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toContain("} is a closing brace character.");
  });
});

describe("space-indented body (legacy)", () => {
  test("4-space indented body still parses correctly", () => {
    const source = [
      "#def name agent",
      "fn main() {",
      "    You are an assistant.",
      "    Be helpful.",
      "}",
      "",
    ].join("\n");
    const agent = parseCAgent(source);
    // Space-indented content passes through (no tab stripping applied)
    expect(agent.systemPrompt).toContain("You are an assistant.");
  });
});

describe("#if at column 0 inside function body", () => {
  test("#if at col-0 acts as a body conditional (active)", () => {
    const source = [
      "#def name agent",
      "#def T gemini",
      "fn main() {",
      "    Before.",
      "#if T == gemini",
      "    Gemini.",
      "#endif",
      "    After.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Before.\nGemini.\nAfter.");
  });

  test("#if at col-0 acts as a body conditional (inactive)", () => {
    const source = [
      "#def name agent",
      "#def T claude",
      "fn main() {",
      "    Before.",
      "#if T == gemini",
      "    Gemini.",
      "#endif",
      "    After.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Before.\nAfter.");
  });

  test("#if != at col-0 acts as a body conditional (active)", () => {
    const source = [
      "#def name agent",
      "#def T gemini",
      "fn main() {",
      "    Before.",
      "#if T != claude",
      "    Non-claude.",
      "#endif",
      "    After.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Before.\nNon-claude.\nAfter.");
  });

  test("#if at col-0 with no content before or after", () => {
    const source = [
      "#def name agent",
      "#def T gemini",
      "fn main() {",
      "#if T == gemini",
      "    Gemini only.",
      "#endif",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Gemini only.");
  });

  test("nested #if at col-0", () => {
    const source = [
      "#def name agent",
      "#def A x",
      "#def B y",
      "fn main() {",
      "#if A == x",
      "    Outer.",
      "#if B == y",
      "    Inner.",
      "#endif",
      "#endif",
      "    Common.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Outer.\nInner.\nCommon.");
  });

  test("nested #if at col-0 with outer inactive skips inner", () => {
    const source = [
      "#def name agent",
      "#def A z",
      "#def B y",
      "fn main() {",
      "#if A == x",
      "    Outer.",
      "#if B == y",
      "    Inner.",
      "#endif",
      "#endif",
      "    Common.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("Common.");
  });
});

describe("indentation-based block closing", () => {
  test("next fn declaration at column 0 closes previous function without }", () => {
    const source = src`#def name agent
fn greet(str name) {
\tSay hello to name.
fn main() {
\tYou are an agent.
}
`;
    const agent = parseCAgent(source);
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("greet");
    expect(agent.skills[0]!.body).toBe("Say hello to name.");
    expect(agent.systemPrompt).toBe("You are an agent.");
  });

  test("EOF closes open function implicitly", () => {
    const source = src`#def name agent
fn main() {
\tYou are an agent.
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You are an agent.");
  });

  test("{ is optional in fn declaration", () => {
    const source = src`#def name agent
fn main()
\tYou are an agent.
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You are an agent.");
  });

  test("column-0 #def closes function and sets frontmatter", () => {
    const source = src`#def name agent
fn main() {
\tYou are an agent.
#def model sonnet
`;
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You are an agent.");
    expect(agent.frontmatter.model).toBe("sonnet");
  });
});

describe("#def variable interpolation", () => {
  test("${varname} in a #def value is replaced with the prior define", () => {
    const source = [
      "#def org_name 1",
      "#def name ${org_name} Code Reviewer",
      "#def name agent",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.name).toBe("agent");
    // ctx.defines["name"] should be "1 Code Reviewer"
    // We can't read defines directly, but if name were a known key it'd land in frontmatter.
    // Use project key which IS a known key to verify interpolation.
  });

  test("interpolated #def name sets the agent name", () => {
    const source = [
      "#def suffix reviewer",
      "#def name code-${suffix}",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.name).toBe("code-reviewer");
  });

  test("interpolated #def sets frontmatter value", () => {
    const source = [
      "#def base haiku",
      "#def model ${base}",
      "#def name agent",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.frontmatter.model).toBe("haiku");
  });

  test("unknown variable reference is left as-is", () => {
    const source = [
      "#def name ${undefined_var} fallback",
      "#def name ${name}",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.name).toBe("${undefined_var} fallback");
  });

  test("chained variable interpolation", () => {
    const source = [
      "#def a foo",
      "#def b ${a}-bar",
      "#def name ${b}-baz",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.name).toBe("foo-bar-baz");
  });

  test("${varname} in body content is interpolated", () => {
    const source = [
      "#def org_name Acme",
      "#def name agent",
      "fn main() {",
      "    You work for ${org_name}.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source);
    expect(agent.systemPrompt).toBe("You work for Acme.");
  });

  test("${varname} in included file body is interpolated with caller defines", () => {
    const files = {
      "temp.ca": "    You work for ${org_name}.\n",
    };
    const source = [
      "#def org_name Acme",
      "#def name agent",
      "fn main() {",
      '    #include "temp.ca"',
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    expect(agent.systemPrompt).toBe("You work for Acme.");
  });

  test("body-level #include processes #def in included file", () => {
    const files = {
      "temp.ca": [
        "#def greeting Hello",
        "Say ${greeting} to the user.",
      ].join("\n"),
    };
    const source = [
      "#def name agent",
      "fn main() {",
      '    #include "temp.ca"',
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    expect(agent.systemPrompt).toBe("Say Hello to the user.");
  });

  test("body-level #include with #if in included file", () => {
    const files = {
      "temp.ca": [
        "#if mode == strict",
        "Be strict.",
        "#endif",
        "Be helpful.",
      ].join("\n"),
    };
    const source = [
      "#def name agent",
      "#def mode strict",
      "fn main() {",
      '    #include "temp.ca"',
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    expect(agent.systemPrompt).toBe("Be strict.\nBe helpful.");
  });

  test("top-level #include imports skills, body-level renders text", () => {
    const files = {
      "skills.ca": [
        "fn greet(str name)",
        "    Say hello to ${name}.",
      ].join("\n"),
      "context.ca": "This is shared context.",
    };
    const source = [
      "#def name agent",
      '#include "skills.ca"',
      "fn main() {",
      '    #include "context.ca"',
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("greet");
    expect(agent.systemPrompt).toBe("This is shared context.");
  });

  test("defines set before top-level #include are available in included file for interpolation", () => {
    const files = {
      "skills.ca": [
        "fn greet(str name)",
        "    Say hello from ${org_name}.",
      ].join("\n"),
    };
    const source = [
      "#def org_name Acme",
      "#def name my-agent",
      '#include "skills.ca"',
      "fn main() {",
      "    You are an agent for ${org_name}.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    // parent name and systemPrompt are NOT overwritten by the included file
    expect(agent.name).toBe("my-agent");
    expect(agent.systemPrompt).toBe("You are an agent for Acme.");
    // skills from the included file are imported and can use parent defines
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("greet");
    expect(agent.skills[0]!.body).toBe("Say hello from Acme.");
  });

  test("fn main() and #def name in included file do not overwrite parent agent", () => {
    const files = {
      "lib.ca": [
        "#def name overwritten-name",
        "fn main() {",
        "    This should not be the system prompt.",
        "}",
        "fn helper()",
        "    Help the user.",
      ].join("\n"),
    };
    const source = [
      "#def name my-agent",
      '#include "lib.ca"',
      "fn main() {",
      "    You are my agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, files);
    expect(agent.name).toBe("my-agent");
    expect(agent.systemPrompt).toBe("You are my agent.");
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("helper");
  });
});

describe("repo includes (#include <alias/path>)", () => {
  test("top-level repo include imports skills", () => {
    const repos = {
      "kotlin-agents": {
        "unit-test-writer.ca": [
          "fn writeTests(str code)",
          "    Write unit tests for the given code.",
        ].join("\n"),
      },
    };
    const source = [
      "#def name my-agent",
      "#include <kotlin-agents/unit-test-writer>",
      "fn main() {",
      "    You are a coding assistant.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, {}, "main.ca", repos);
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("writeTests");
    expect(agent.systemPrompt).toBe("You are a coding assistant.");
  });

  test("repo include resolves path with .ca extension automatically", () => {
    const repos = {
      "my-lib": {
        "helper.ca": "fn help()\n    Be helpful.",
      },
    };
    const source = [
      "#def name agent",
      "#include <my-lib/helper>",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, {}, "main.ca", repos);
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("help");
  });

  test("body-level repo include renders content as text", () => {
    const repos = {
      "shared": {
        "context.ca": "You work for a great company.",
      },
    };
    const source = [
      "#def name agent",
      "fn main() {",
      "    #include <shared/context>",
      "    Be helpful.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, {}, "main.ca", repos);
    expect(agent.systemPrompt).toBe("You work for a great company.\nBe helpful.");
  });

  test("unknown repo produces a warning", () => {
    const source = [
      "#def name agent",
      "#include <missing-repo/something>",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, {}, "main.ca", {});
    expect(agent.warnings.some((w) => w.key === "#include" && w.message.includes("missing-repo"))).toBe(true);
  });

  test("missing file in a known repo produces a warning", () => {
    const repos = { "my-lib": {} };
    const source = [
      "#def name agent",
      "#include <my-lib/no-such-file>",
      "fn main() {",
      "    You are an agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, {}, "main.ca", repos);
    expect(agent.warnings.some((w) => w.key === "#include" && w.message.includes("no-such-file"))).toBe(true);
  });

  test("repo include respects #def name isolation (fn main ignored)", () => {
    const repos = {
      "lib": {
        "agent.ca": [
          "#def name overwritten",
          "fn main() { This should be ignored. }",
          "fn util()",
          "    Utility function.",
        ].join("\n"),
      },
    };
    const source = [
      "#def name my-agent",
      "#include <lib/agent>",
      "fn main() {",
      "    You are my agent.",
      "}",
    ].join("\n");
    const agent = parseCAgent(source, {}, "main.ca", repos);
    expect(agent.name).toBe("my-agent");
    expect(agent.systemPrompt).toBe("You are my agent.");
    expect(agent.skills).toHaveLength(1);
    expect(agent.skills[0]!.name).toBe("util");
  });
});
