import { parseCAgent } from "./parser";
import type { ParsedAgent } from "./parser";
import { PLATFORMS, PLATFORM_LABELS } from "./compat";
import type { Platform } from "./compat";
import { GENERATORS } from "./index";
import { fetchRepos } from "./repos";
import { fetchSkillsShPackages } from "./skillssh";

export type { Platform };

export const DEFAULT_TEMPLATE = `#def name my-agent
#def description A helpful assistant agent
#def model sonnet
#def tools Read, Glob, Grep

fn greet(str name) {
\tSay hello to the user by name.
\tBe friendly and warm.
}

fn analyze(str input, int depth) {
\tAnalyze the given input thoroughly.
\tConsider multiple angles and provide
\ta structured breakdown.
\tDepth controls how detailed to go (1-5).
}

fn main() {
\tYou are a helpful assistant.
\tYou help users with their tasks.
\tAlways be concise and clear.
}
`;

export interface IO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(dir: string): Promise<void>;
  spawn(cmd: string[]): Promise<void>;
}

export type InstallScope = "local" | "user";

export function parseFlags(args: string[]): { target: Platform; scope: InstallScope; repos: string[]; rest: string[] } {
  let target: Platform = "claude";
  let scope: InstallScope = "local";
  const repos: string[] = [];
  const rest: string[] = [];
  const valid = PLATFORMS as readonly string[];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        console.error(`Error: --target requires a value: ${PLATFORMS.join(" | ")}`);
        process.exit(1);
      }
      if (!valid.includes(value)) {
        console.error(`Error: unknown target "${value}". Valid targets: ${PLATFORMS.join(", ")}`);
        process.exit(1);
      }
      target = value as Platform;
      i++;
    } else if (args[i] === "--repos") {
      // Collect all following values until the next flag
      while (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        i++;
        repos.push(args[i]!);
      }
    } else if (args[i] === "--user") {
      scope = "user";
    } else if (args[i] === "--local") {
      scope = "local";
    } else {
      rest.push(args[i]!);
    }
  }

  return { target, scope, repos, rest };
}

// Keep backward-compatible export
export function parseTargetFlag(args: string[]): { target: Platform; rest: string[] } {
  const { target, rest } = parseFlags(args);
  return { target, rest };
}

export { fetchRepos };

function resolveBaseDir(scope: InstallScope): string {
  if (scope === "user") {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    if (!home) {
      console.error("Error: could not determine home directory for --user install");
      process.exit(1);
    }
    return home.replace(/\/$/, "") + "/";
  }
  return "";
}

function printHelp() {
  const targetLines = PLATFORMS.map((p, i) => {
    const isDefault = i === 0;
    return `  --target ${p.padEnd(10)}${isDefault ? "(default) " : "          "}${PLATFORM_LABELS[p]}`;
  }).join("\n");

  console.log(`
C-Agents — Low-level programming for AI agents.

Usage:
  cagents [build] [--target <t>] [--local|--user] [--repos <url>...] <file.ca>   Build agent files (default)
  cagents run    [--target <t>] [--local|--user] [--repos <url>...] <file.ca>   Build then launch the target CLI
  cagents init [name]                                                               Create a new agent template

Targets:
${targetLines}

Install scope:
  --local             (default) Write files into the current project directory (./)
  --user              Write files into the home directory (~/)

Repos:
  --repos <url>...    GitHub repos to resolve #include <alias/path> directives.
                      Alias is the repo name (last URL segment). Multiple URLs allowed.

Examples:
  cagents my-agent.ca
  cagents --target kiro my-agent.ca
  cagents --user my-agent.ca
  cagents --target cursor --user my-agent.ca
  cagents build *.ca
  cagents --repos github.com/user1/kotlin-agents my-agent.ca
  cagents --repos github.com/user1/kotlin-agents github.com/user2/python-agents my-agent.ca

Docs: https://cagents.io/spec
`);
}

const LAUNCH_COMMANDS: Partial<Record<Platform, (name: string) => string[]>> = {
  claude: (name) => ["claude", "--agent", name],
  gemini: (_)    => ["gemini"],
  codex:  (_)    => ["codex"],
};

async function build(io: IO, files: string[], target: Platform, scope: InstallScope, repoUrls: string[] = []): Promise<ParsedAgent[]> {
  if (files.length === 0) {
    console.error("Error: no files specified");
    console.error(`Usage: cagents [build] [--target ${PLATFORMS.join("|")}] [--local|--user] <file.ca> [...]`);
    process.exit(1);
  }

  const baseDir = resolveBaseDir(scope);

  // Read all sources first so we can scan for repo includes once
  const sources: { file: string; source: string }[] = [];
  for (const file of files) {
    if (!(await io.exists(file))) {
      console.error(`Error: file not found: ${file}`);
      process.exit(1);
    }
    sources.push({ file, source: await io.readFile(file) });
  }

  const sourcesText = sources.map((s) => s.source);

  // Fetch GitHub repos and skills.sh packages in parallel
  const [repos, skillssh] = await Promise.all([
    repoUrls.length > 0 ? fetchRepos(repoUrls, sourcesText) : Promise.resolve({}),
    fetchSkillsShPackages(sourcesText),
  ]);

  const agents: ParsedAgent[] = [];
  for (const { file, source } of sources) {
    const agent = parseCAgent(source, undefined, file, repos, skillssh);
    agents.push(agent);

    for (const w of agent.warnings) {
      console.warn(`  ⚠ ${file}:${w.line} [${w.key}] ${w.message}`);
    }

    const generate = GENERATORS[target];
    for (const { path, content } of generate(agent)) {
      const fullPath = baseDir + path;
      const dir = fullPath.split("/").slice(0, -1).join("/");
      if (dir) await io.mkdir(dir);
      await io.writeFile(fullPath, content);
      console.log(`  ✓ ${fullPath}`);
    }
  }
  return agents;
}

async function run(io: IO, files: string[], target: Platform, scope: InstallScope, repoUrls: string[]) {
  const agents = await build(io, files, target, scope, repoUrls);
  const agentName = agents[0]!.name;

  const getCmd = LAUNCH_COMMANDS[target];
  if (!getCmd) {
    console.log(`\n  Built for ${PLATFORM_LABELS[target]}. Open your IDE to use the "${agentName}" agent.`);
    return;
  }

  const cmd = getCmd(agentName);
  console.log(`\n  → ${cmd.join(" ")}`);
  await io.spawn(cmd);
}

async function init(io: IO, name = "my-agent") {
  const filename = `${name}.ca`;
  if (await io.exists(filename)) {
    console.error(`Error: ${filename} already exists`);
    process.exit(1);
  }
  const content = DEFAULT_TEMPLATE.replace(/my-agent/g, name);
  await io.writeFile(filename, content);
  console.log(`  ✓ ${filename}`);
  console.log(`\nNext: cagents build ${filename}`);
}

export async function runCLI(io: IO, args: string[]) {
  const cmd = args[0];

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "init") {
    const { rest } = parseFlags(args.slice(1));
    await init(io, rest[0]);
    return;
  }

  if (cmd === "run") {
    const { target, scope, repos, rest } = parseFlags(args.slice(1));
    await run(io, rest, target, scope, repos);
    return;
  }

  // "build" is the default — accept it explicitly or fall through when cmd looks like a file/flag
  const isBuildCmd = cmd === "build";
  const { target, scope, repos, rest } = parseFlags(isBuildCmd ? args.slice(1) : args);
  await build(io, rest, target, scope, repos);
}
