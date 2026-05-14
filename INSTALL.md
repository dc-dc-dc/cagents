# Installation

## npx (no install required)

Run C-Agents directly without installing:

```sh
npx cagents my-agent.ca
npx cagents --target kiro my-agent.ca
npx cagents init my-project
```

## npm (global install)

```sh
npm install -g cagents
cagents my-agent.ca
```

## Bun (global install)

```sh
bun add -g cagents
cagents my-agent.ca
```

## pnpm (global install)

```sh
pnpm add -g cagents
cagents my-agent.ca
```

---

## Building from source

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/dc-dc-dc/cagents
cd cagents
bun install
bun run build
```

The compiled CLI is written to `dist/cli-node.js` and can be run with `node dist/cli-node.js` or linked globally.

### Run directly with Bun (no build step)

```sh
bun src/cli.ts my-agent.ca
```

---

## Verify installation

```sh
cagents --help
```

Expected output:

```
C-Agents — Low-level programming for AI agents.

Usage:
  cagents [build] [--target <t>] [--local|--user] [--repos <url>...] <file.ca>
  cagents init [name]

Targets:
  --target claude     (default) Claude Code
  --target kiro                 Kiro
  --target gemini               Gemini CLI
  --target codex                Codex CLI
  --target cursor               Cursor
```
