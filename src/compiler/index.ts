export * from "./parser";
export * from "./compat";
export * from "./repos";
export * from "./skillssh";
export * from "./targets/claude";
export * from "./targets/kiro";
export * from "./targets/gemini";
export * from "./targets/codex";
export * from "./targets/cursor";
export * from "./targets/claude_sdk";

import { generateAgentFiles } from "./targets/claude";
import { generateKiroFiles } from "./targets/kiro";
import { generateGeminiFiles } from "./targets/gemini";
import { generateCodexFiles } from "./targets/codex";
import { generateCursorFiles } from "./targets/cursor";
import { generateSdkFiles } from "./targets/claude_sdk";
import type { Platform } from "./compat";
import type { ParsedAgent, GeneratedFile } from "./parser";

export const GENERATORS: Record<Platform, (agent: ParsedAgent) => GeneratedFile[]> = {
  claude: generateAgentFiles,
  kiro:   generateKiroFiles,
  gemini: generateGeminiFiles,
  codex:  generateCodexFiles,
  cursor: generateCursorFiles,
  claude_sdk: generateSdkFiles,
};
