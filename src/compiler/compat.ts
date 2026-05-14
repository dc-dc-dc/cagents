export const PLATFORMS = ["claude", "kiro", "gemini", "codex", "cursor"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  claude: "Claude Code",
  kiro:   "Kiro",
  gemini: "Gemini CLI",
  codex:  "Codex CLI",
  cursor: "Cursor",
};

export type SupportLevel =
  | "full"     // emitted as-is
  | "mapped"   // transformed to platform-native format
  | "none";    // parsed but ignored for this target

export interface PlatformSupport {
  level: SupportLevel;
  note?: string;
}

export type FieldCategory = "identity" | "model" | "tools" | "execution" | "platform";

export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  identity:  "Identity",
  model:     "Model",
  tools:     "Tools",
  execution: "Execution",
  platform:  "Platform-Specific",
};

export interface FieldDef {
  key: string;
  description: string;
  type: "string" | "enum" | "boolean" | "int" | "float" | "list";
  values?: readonly string[];
  example: string;
  category: FieldCategory;
  platforms: Record<Platform, PlatformSupport>;
}

export const FIELDS: readonly FieldDef[] = [

  // ── Identity ──────────────────────────────────────────────────────────────
  {
    key: "description",
    description: "Short description of the agent's purpose and capabilities.",
    type: "string",
    example: "#def description Reviews code for quality and security",
    category: "identity",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "full",   note: "Used by Kiro for agent auto-activation matching." },
      gemini: { level: "full",   note: "Used by Gemini for delegation decisions between agents." },
      codex:  { level: "full",   note: "Written as a paragraph below the agent name in AGENTS.md." },
      cursor: { level: "full",   note: "Written as description in the .mdc rule frontmatter." },
    },
  },
  {
    key: "kind",
    description: "Agent deployment kind. local runs in the CLI process; remote delegates via the A2A protocol.",
    type: "enum",
    values: ["local", "remote"],
    example: "#def kind local",
    category: "identity",
    platforms: {
      claude: { level: "none" },
      kiro:   { level: "none" },
      gemini: { level: "full" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },

  // ── Model ─────────────────────────────────────────────────────────────────
  {
    key: "model",
    description: "Which model the agent uses.",
    type: "enum",
    values: ["haiku", "sonnet", "opus"],
    example: "#def model sonnet",
    category: "model",
    platforms: {
      claude: { level: "full",   note: "Written as-is to frontmatter." },
      kiro:   { level: "mapped", note: "haiku → claude-haiku-4-5 · sonnet → claude-sonnet-4-5 · opus → claude-opus-4" },
      gemini: { level: "mapped", note: "haiku → gemini-2.0-flash · sonnet → gemini-2.5-flash · opus → gemini-2.5-pro" },
      codex:  { level: "mapped", note: "haiku → codex-mini-latest · sonnet → o4-mini · opus → o3. Emitted as an HTML comment in AGENTS.md." },
      cursor: { level: "mapped", note: "Emitted as an HTML comment in the .mdc rule. Cursor selects model per-session in the UI." },
    },
  },
  {
    key: "effort",
    description: "Reasoning effort level for extended thinking.",
    type: "enum",
    values: ["low", "medium", "high"],
    example: "#def effort high",
    category: "model",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "maxTurns",
    description: "Maximum conversation turns before the agent stops.",
    type: "int",
    example: "#def maxTurns 50",
    category: "model",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "mapped", note: "Emitted as max_turns in YAML frontmatter." },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "temperature",
    description: "Model temperature (0.0–2.0). Controls response randomness. Gemini-specific.",
    type: "float",
    example: "#def temperature 0.7",
    category: "model",
    platforms: {
      claude: { level: "none" },
      kiro:   { level: "none" },
      gemini: { level: "full" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },

  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    key: "tools",
    description: "Tools the agent is allowed to use.",
    type: "list",
    example: "#def tools Read, Glob, Grep, Bash",
    category: "tools",
    platforms: {
      claude: { level: "full",   note: "Written as a comma-separated string." },
      kiro:   { level: "mapped", note: "Mapped to Kiro categories (read, write, shell, web, spec) and emitted as a YAML array." },
      gemini: { level: "mapped", note: "Mapped to Gemini tool names (read_file, glob, run_shell_command, etc.) and emitted as a YAML array." },
      codex:  { level: "none",   note: "Tool access is controlled by the --approval-mode CLI flag, not per-agent configuration." },
      cursor: { level: "none",   note: "Tool access is configured globally in Cursor settings, not per-rule." },
    },
  },
  {
    key: "disallowedTools",
    description: "Tools explicitly denied. Takes precedence over tools.",
    type: "list",
    example: "#def disallowedTools Bash, Write",
    category: "tools",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "permissionMode",
    description: "How the agent handles permission prompts.",
    type: "enum",
    values: ["default", "acceptEdits", "fullAuto"],
    example: "#def permissionMode acceptEdits",
    category: "tools",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "allowedTools",
    description: "Tools that execute without requiring user confirmation. Kiro-specific.",
    type: "list",
    example: "#def allowedTools Read, Glob",
    category: "tools",
    platforms: {
      claude: { level: "none" },
      kiro:   { level: "full", note: "Written as a YAML array of tool names." },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },

  // ── Execution ─────────────────────────────────────────────────────────────
  {
    key: "background",
    description: "Whether the agent runs in the background.",
    type: "boolean",
    values: ["true", "false"],
    example: "#def background true",
    category: "execution",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "isolation",
    description: "Filesystem isolation level for the agent process.",
    type: "enum",
    values: ["full", "light", "none"],
    example: "#def isolation light",
    category: "execution",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "memory",
    description: "Whether the agent has access to persistent memory.",
    type: "boolean",
    values: ["true", "false"],
    example: "#def memory true",
    category: "execution",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "color",
    description: "Status line color for this agent in Claude Code.",
    type: "string",
    example: "#def color #4A9EFF",
    category: "execution",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "initialPrompt",
    description: "Prompt automatically sent when the agent starts.",
    type: "string",
    example: "#def initialPrompt Run the full test suite first",
    category: "execution",
    platforms: {
      claude: { level: "full" },
      kiro:   { level: "none" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "timeoutMins",
    description: "Maximum execution time in minutes. Gemini-specific.",
    type: "int",
    example: "#def timeoutMins 10",
    category: "execution",
    platforms: {
      claude: { level: "none" },
      kiro:   { level: "none" },
      gemini: { level: "mapped", note: "Emitted as timeout_mins in YAML frontmatter." },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },

  // ── Platform-Specific ─────────────────────────────────────────────────────
  {
    key: "includeMcpJson",
    description: "Auto-include all MCP servers defined in .kiro/mcp.json. Kiro-specific.",
    type: "boolean",
    values: ["true", "false"],
    example: "#def includeMcpJson true",
    category: "platform",
    platforms: {
      claude: { level: "none" },
      kiro:   { level: "full" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
  {
    key: "welcomeMessage",
    description: "Message displayed when the agent activates in Kiro IDE. Kiro-specific.",
    type: "string",
    example: "#def welcomeMessage Ready to review your code.",
    category: "platform",
    platforms: {
      claude: { level: "none" },
      kiro:   { level: "full" },
      gemini: { level: "none" },
      codex:  { level: "none" },
      cursor: { level: "none" },
    },
  },
] as const satisfies readonly FieldDef[];

// ── Tool Registry ─────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  platforms: Record<Platform, string>;
}

export const TOOLS: readonly ToolDef[] = [
  // Read-only filesystem
  { name: "Read",         description: "Read file contents",                      platforms: { claude: "Read",         kiro: "read",  gemini: "read_file",         codex: "shell", cursor: "read_file"        } },
  { name: "Glob",         description: "Find files matching a glob pattern",      platforms: { claude: "Glob",         kiro: "read",  gemini: "glob",              codex: "shell", cursor: "file_search"      } },
  { name: "Grep",         description: "Search file contents by pattern",         platforms: { claude: "Grep",         kiro: "read",  gemini: "grep_search",       codex: "shell", cursor: "grep_search"      } },
  { name: "LS",           description: "List directory contents",                 platforms: { claude: "LS",           kiro: "read",  gemini: "list_directory",    codex: "shell", cursor: "list_dir"         } },
  { name: "NotebookRead", description: "Read Jupyter notebook cells and outputs", platforms: { claude: "NotebookRead", kiro: "read",  gemini: "read_file",         codex: "shell", cursor: "read_file"        } },
  // Write filesystem
  { name: "Write",        description: "Create or overwrite files",               platforms: { claude: "Write",        kiro: "write", gemini: "write_file",        codex: "shell", cursor: "edit_file"        } },
  { name: "Edit",         description: "Apply targeted edits to existing files",  platforms: { claude: "Edit",         kiro: "write", gemini: "write_file",        codex: "shell", cursor: "edit_file"        } },
  { name: "MultiEdit",    description: "Apply multiple edits in one operation",   platforms: { claude: "MultiEdit",    kiro: "write", gemini: "write_file",        codex: "shell", cursor: "edit_file"        } },
  { name: "NotebookEdit", description: "Edit Jupyter notebook cells",             platforms: { claude: "NotebookEdit", kiro: "write", gemini: "write_file",        codex: "shell", cursor: "edit_file"        } },
  // Shell
  { name: "Bash",         description: "Execute shell commands",                  platforms: { claude: "Bash",         kiro: "shell", gemini: "run_shell_command", codex: "shell", cursor: "run_terminal_cmd" } },
  // Web
  { name: "WebSearch",    description: "Search the web",                          platforms: { claude: "WebSearch",    kiro: "web",   gemini: "google_search",     codex: "web_search", cursor: "web_search"  } },
  { name: "WebFetch",     description: "Fetch content from a URL",                platforms: { claude: "WebFetch",     kiro: "web",   gemini: "web_fetch",         codex: "web_fetch",  cursor: "web_fetch"   } },
  // Task management (no Cursor/Gemini/Codex equivalent)
  { name: "TodoRead",     description: "Read the current task/todo list",         platforms: { claude: "TodoRead",     kiro: "spec",  gemini: "",                  codex: "",           cursor: ""            } },
  { name: "TodoWrite",    description: "Write to the task/todo list",             platforms: { claude: "TodoWrite",    kiro: "spec",  gemini: "",                  codex: "",           cursor: ""            } },
  { name: "Task",         description: "Spawn a subagent for parallel tasks",     platforms: { claude: "Task",         kiro: "spec",  gemini: "",                  codex: "",           cursor: ""            } },
] as const satisfies readonly ToolDef[];

// Lookup by lowercase canonical name
export const TOOL_REGISTRY = new Map<string, ToolDef>(
  (TOOLS as readonly ToolDef[]).map((t) => [t.name.toLowerCase(), t])
);

export function isKnownTool(name: string): boolean {
  return TOOL_REGISTRY.has(name.toLowerCase());
}

/** Returns the platform-native representation for a tool name.
 *  Unknown tools (MCP, custom) pass through as-is lowercased.
 *  Returns empty string if the tool has no equivalent on this platform. */
export function resolveToolName(name: string, platform: Platform): string {
  const def = TOOL_REGISTRY.get(name.toLowerCase());
  return def ? def.platforms[platform] : name.toLowerCase();
}

/** Resolves a comma-separated tools string to a deduplicated list of
 *  platform-native names. Skips tools with no platform equivalent (empty string). */
export function resolveTools(toolsStr: string, platform: Platform): string[] {
  const seen = new Set<string>();
  for (const raw of toolsStr.split(",").map((t) => t.trim()).filter(Boolean)) {
    const resolved = resolveToolName(raw, platform);
    if (resolved) seen.add(resolved);
  }
  return [...seen];
}

// ── Field Registry ────────────────────────────────────────────────────────────

export const ALL_KNOWN_KEYS: string[] = FIELDS.map((f) => f.key);

export function platformKeys(platform: Platform): string[] {
  return FIELDS.filter((f) => f.platforms[platform].level !== "none").map((f) => f.key);
}

export const CLAUDE_OUTPUT_KEYS = [
  "description",
  "model",
  "effort",
  "maxTurns",
  "tools",
  "disallowedTools",
  "permissionMode",
  "background",
  "isolation",
  "memory",
  "color",
  "initialPrompt",
] as const;
