# C-Agents

Low-level programming for AI agents.

C-Agents is a C-like DSL for defining AI agents. Write your agent once in a `.ca` file and compile it to the native format of any supported platform — Claude, Kiro, Gemini, Codex, or Cursor.

```
cagents my-agent.ca
```

---

## The language

A `.ca` file looks like C but describes an AI agent instead of a program. Functions become skills, `main()` becomes the system prompt.

```c
#def name code-reviewer
#def description Reviews code for quality and correctness
#def model sonnet
#def tools Read, Glob, Grep

fn review(str file, int depth) {
    Review the file for code quality.
    depth controls thoroughness (1–5).
}

fn main() {
    You are a code review specialist.
    Be direct. Flag real problems only.
}
```

### Directives

| Directive | Description |
|-----------|-------------|
| `#def name <value>` | Agent name (used for output file paths) |
| `#def description <value>` | Short description of the agent |
| `#def model <haiku\|sonnet\|opus>` | Model to use |
| `#def tools <list>` | Comma-separated list of tool names |
| `#def effort <low\|medium\|high>` | Task effort level |
| `#def maxTurns <n>` | Maximum agentic loop turns |
| `#def permissionMode <default\|acceptEdits\|fullAuto>` | Permission mode |

### Functions

`fn main()` — the system prompt. Defines the agent's base behavior and identity.

`fn <name>(<params>)` — a skill. Each skill becomes a separate file (slash command, sub-agent, etc.) on the target platform.

Parameter types: `str`, `int`, `float`, `bool`

### Conditionals

```c
#def env production

#if env == production
    Be conservative. Prefer safe changes.
#endif
```

### Includes

Include another `.ca` file or a file from a GitHub repo:

```c
#include "shared/common.ca"
#include <my-org/shared-agents/review-skills>
```

Pass repos with `--repos`:

```
cagents --repos github.com/my-org/shared-agents my-agent.ca
```

---

## Targets

| Flag | Platform | Output |
|------|----------|--------|
| `--target claude` | Claude Code (default) | `.claude/agents/<name>.md` + `skills/` |
| `--target kiro` | Kiro (Amazon) | `.kiro/steering/<name>.md` |
| `--target gemini` | Gemini CLI | `.gemini/agents/<name>.md` |
| `--target codex` | Codex CLI | `AGENTS.md` |
| `--target cursor` | Cursor | `.cursor/rules/<name>.mdc` |

---

## Usage

```sh
# Scaffold a new agent
cagents init my-agent

# Build agent files (default target: claude)
cagents my-agent.ca

# Build for a specific platform
cagents --target kiro my-agent.ca

# Install to home directory (useful for user-level agents)
cagents --user my-agent.ca

# Install for a specific platform to home directory
cagents --target cursor --user my-agent.ca

# Build multiple files
cagents build *.ca

# Build with shared repo includes
cagents --repos github.com/my-org/shared-agents my-agent.ca
```

### Install scope

| Flag | Description |
|------|-------------|
| `--local` | Write files into the current directory `./` (default) |
| `--user` | Write files into the home directory `~/` |

---

## Installation

See [INSTALL.md](./INSTALL.md) for full installation instructions.

```sh
# Run without installing
npx cagents my-agent.ca

# Install globally with npm
npm install -g cagents

# Install globally with Bun
bun add -g cagents
```

---

## How it works

1. Parse the `.ca` source file into an AST (frontmatter + system prompt + skills)
2. Validate frontmatter fields against a schema
3. Map tool names to the target platform's native tool names
4. Generate the target platform's native file format

All logic lives in `src/compiler/`. The CLI is a thin wrapper in `src/cli.ts` (Bun) and `src/cli-node.ts` (Node).

---

## License

MIT
