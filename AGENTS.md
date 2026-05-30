# cagents — Agent Guide

C-Agents is a compiler. It takes `.ca` source files (a C-like DSL for AI agents) and compiles them to the native format of target platforms: Claude Code, Kiro, Gemini CLI, Codex CLI, Cursor, and the Anthropic SDK.

---

## Commands

```sh
bun test              # run all tests
bun run typecheck     # type-check without emitting
bun run build         # bundle dist/cli-node.js (Node-compatible CLI)
```

Run a specific test file:
```sh
bun test src/compiler/targets/claude_sdk.test.ts
```

Run the CLI directly without building:
```sh
bun src/cli.ts my-agent.ca
bun src/cli.ts --target kiro my-agent.ca
bun src/cli.ts init my-new-agent
```

---

## Repository layout

```
src/
  cli.ts                  Bun entry point (thin shell over cli-core)
  cli-node.ts             Node.js entry point (thin shell over cli-core)
  compiler/
    cli-core.ts           CLI logic: flag parsing, build(), init(), runCLI()
    parser.ts             Single-pass state-machine parser → ParsedAgent
    compat.ts             Platform registry, field schema, tool registry
    repos.ts              GitHub repo fetcher for #include <alias/path>
    index.ts              GENERATORS map: Platform → generateFn
    targets/
      claude.ts           → .claude/agents/<name>.md + skills/
      kiro.ts             → .kiro/steering/<name>.md
      gemini.ts           → .gemini/agents/<name>.md
      codex.ts            → AGENTS.md
      cursor.ts           → .cursor/rules/<name>.mdc
      claude_sdk.ts       → <name>.ts (typed Anthropic SDK wrapper)
examples/
  *.ca                    Ready-to-use starting points
```

Each `targets/<platform>.ts` exports:
- `generate<X>Files(agent: ParsedAgent): GeneratedFile[]` — the main entry
- `generate<X><something>(...): string` — inner string builder, unit-tested directly

---

## Key types

```ts
// parser.ts
interface ParsedAgent {
  name: string;
  systemPrompt: string;
  skills: ParsedSkill[];           // fn declarations (inline or tool)
  frontmatter: Record<string, string>;
  warnings: FrontmatterWarning[];
  repoConfigs: Record<string, string>;
}

interface ParsedSkill {
  name: string;
  params: string;    // raw param string, e.g. "str file, int depth"
  body: string;      // cleaned body text
  inline: boolean;   // true when preceded by #pragma inline
}

// compiler/index.ts
type GENERATORS = Record<Platform, (agent: ParsedAgent) => GeneratedFile[]>

// compat.ts
type Platform = "claude" | "kiro" | "gemini" | "codex" | "cursor" | "claude_sdk"
```

---

## How to add a new platform target

1. Create `src/compiler/targets/<name>.ts` exporting `generate<Name>Files(agent: ParsedAgent): GeneratedFile[]`.
2. Add the platform key to `PLATFORMS` in `compat.ts` and add a label to `PLATFORM_LABELS`.
3. Add a `PlatformSupport` entry for every field in `FIELDS` in `compat.ts`.
4. Add an entry to `TOOL_REGISTRY` rows (the `platforms` column) in `compat.ts`.
5. Import and wire the generator into `GENERATORS` in `index.ts`.
6. Create `src/compiler/targets/<name>.test.ts` with tests (see existing test files for patterns).

---

## Testing conventions

- Tests use `bun:test` (`test`, `expect`, `describe`).
- Each target has its own `<target>.test.ts` next to the implementation.
- Tests call the inner string-builder function directly (e.g. `generateSdkAgentTs`) rather than the file-list wrapper, so they can assert on the generated string.
- Use `parseCAgent(src.trim() + "\n")` to build a `ParsedAgent` fixture from inline source.
- Tests assert with `.toContain(...)` — they check for the presence of key strings in the generated output, not the exact format. Avoid snapshot tests.

---

## The `.ca` language (quick reference)

```c
// Directives (top-level)
#def name my-agent
#def description Short description of the agent
#def model haiku | sonnet | opus
#def tools Read, Glob, Grep, Bash
#def effort low | medium | high
#def maxTurns 30
#def permissionMode default | acceptEdits | fullAuto

// Conditionals
#def env production
#if env == production
    Be conservative.
#endif

// Skills — become tools, slash commands, or sub-agents depending on target
fn skill_name(str param, int count) {
    Skill description and behavior.
}

// Inline skills — embedded in the system prompt, not as a separate tool
#pragma inline
fn helper() {
    This is embedded directly into the system prompt.
}

// System prompt
fn main() {
    You are a helpful assistant.
}

// Includes
#include "shared/common.ca"          // local file
#include <repo-alias/path/to/skill>  // GitHub repo (pass with --repos)
```

Parameter types: `str`, `int`, `float`, `bool`

---

## Parser behavior: key invariants

- `fn main()` inside an `#include`d file does **not** overwrite the parent agent's system prompt.
- Function bodies are indentation-delimited: any column-0 non-blank line closes the current body and is re-processed as top-level.
- `#pragma inline` applies to the **next** `fn` declaration only.
- `#def` inside a function body sets a variable local to that scope; at top level it sets a frontmatter field (if the key is known) and a define variable.
- Unknown `#def` keys at the top level are silently stored as defines (available for `${var}` interpolation) but not emitted to frontmatter.
- `//` lines inside a function body are stripped (treated as comments).

---

## Common mistakes to avoid

- Do not add a new platform to `GENERATORS` without also updating `FIELDS[*].platforms` and `TOOLS[*].platforms` in `compat.ts` — the compat matrix is exhaustive by design.
- `parseCAgent` is sync; `parseCAgentStream` is async (for large files). Use the appropriate one.
- `formatParams` converts raw param strings (`"str file, int depth"`) to human-readable form (`"file (string), depth (number)"`). Use it when emitting skill descriptions; use `parseParams` (in `claude_sdk.ts`) when you need structured type info.
- Target generators must be pure functions of `ParsedAgent`. Do not read files or make network calls inside a generator.
