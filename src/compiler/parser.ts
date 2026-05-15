import { z } from "zod";
import { ALL_KNOWN_KEYS, isKnownTool, TOOLS } from "./compat";

// ── Public types ────────────────────────────────────────────────────────────

export interface ParsedSkill {
  name: string;
  params: string;
  body: string;
  inline: boolean;
}

export interface FrontmatterWarning {
  key: string;
  value: string;
  message: string;
  line: number;
}

export interface ParsedAgent {
  name: string;
  systemPrompt: string;
  skills: ParsedSkill[];
  frontmatter: Record<string, string>;
  warnings: FrontmatterWarning[];
  repoConfigs: Record<string, string>;
}

export const FrontmatterSchema = z.object({
  description:     z.string().optional(),
  model:           z.enum(["haiku", "sonnet", "opus"]).optional(),
  tools:           z.string().regex(/^[\w]+(,\s*[\w]+)*$/, "Comma-separated tool names").optional(),
  effort:          z.enum(["low", "medium", "high"]).optional(),
  maxTurns:        z.string().regex(/^\d+$/, "Must be a positive integer").optional(),
  disallowedTools: z.string().regex(/^[\w]+(,\s*[\w]+)*$/, "Comma-separated tool names").optional(),
  permissionMode:  z.enum(["default", "acceptEdits", "fullAuto"]).optional(),
  background:      z.enum(["true", "false"]).optional(),
  isolation:       z.enum(["full", "light", "none"]).optional(),
  memory:          z.enum(["true", "false"]).optional(),
  color:           z.string().optional(),
  initialPrompt:   z.string().optional(),
  allowedTools:    z.string().regex(/^[\w]+(,\s*[\w]+)*$/, "Comma-separated tool names").optional(),
  includeMcpJson:  z.enum(["true", "false"]).optional(),
  welcomeMessage:  z.string().optional(),
  temperature:     z.string().regex(/^\d+(\.\d+)?$/, "Must be a number (e.g. 0.7)").optional(),
  timeoutMins:     z.string().regex(/^\d+$/, "Must be a positive integer").optional(),
  kind:            z.enum(["local", "remote"]).optional(),
});

// ── Markdown include helpers ─────────────────────────────────────────────────

/**
 * Detect whether a `.md` file is a pre-compiled skill (has YAML frontmatter
 * with a `name` key) or a plain context file.
 *
 * Skill .md (frontmatter detected):
 *   ---
 *   name: review
 *   parameters: file (string), depth (number)
 *   ---
 *   Body text…
 *
 * Context .md (no frontmatter or no `name` key): raw text is returned as-is.
 */
function parseMdContent(
  content: string
): { type: "skill"; name: string; params: string; body: string } | { type: "context"; text: string } {
  if (!content.startsWith("---\n")) return { type: "context", text: content };
  const closeIdx = content.indexOf("\n---", 4);
  if (closeIdx === -1) return { type: "context", text: content };
  const fm: Record<string, string> = {};
  for (const fmLine of content.slice(4, closeIdx).split("\n")) {
    const fmm = fmLine.match(/^([\w]+):\s*(.+)$/);
    if (fmm) fm[fmm[1]!] = fmm[2]!.trim();
  }
  if (!fm["name"]) return { type: "context", text: content };
  const bodyStart = closeIdx + 4 + (content[closeIdx + 4] === "\n" ? 1 : 0);
  const body = content.slice(bodyStart).trim();
  return { type: "skill", name: fm["name"], params: fm["parameters"] ?? "", body };
}

// ── Path utilities ──────────────────────────────────────────────────────────

function normalizePath(path: string): string {
  const out: string[] = [];
  for (const p of path.split("/")) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

function parentDir(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.slice(0, idx + 1) : "";
}

/** Standalone include resolver — useful when all files are already loaded as strings. */
export function resolveIncludes(
  source: string,
  files: Record<string, string>,
  currentPath = "",
  visited: Set<string> = new Set()
): string {
  const dir = parentDir(currentPath);
  return source.replace(/^#include\s+"([^"]+)"\s*$/gm, (_m, rawPath: string) => {
    const resolved = normalizePath(rawPath.startsWith("/") ? rawPath.slice(1) : dir + rawPath);
    if (visited.has(resolved)) return `// #include "${rawPath}" — circular reference`;
    const content = files[resolved];
    if (content === undefined) return `// #include "${rawPath}" — file not found`;
    return resolveIncludes(content, files, resolved, new Set([...visited, resolved]));
  });
}

// ── Streaming line utilities ────────────────────────────────────────────────

/** Lazily split a string into lines without allocating a full intermediate array. */
function* splitLines(source: string): Generator<string> {
  let start = 0;
  while (true) {
    const idx = source.indexOf("\n", start);
    if (idx === -1) { yield source.slice(start); break; }
    yield source.slice(start, idx);
    start = idx + 1;
  }
}

/**
 * Convert a ReadableStream<Uint8Array> (e.g. Bun.file(path).stream()) into an
 * async line iterator. Pass to parseCAgentStream for large files on disk.
 */
export async function* streamToLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const dec    = new TextDecoder();
  let buf      = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { if (buf) yield buf; break; }
      const chunk = buf + dec.decode(value, { stream: true });
      const parts = chunk.split("\n");
      buf = parts.pop()!;
      yield* parts;
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Variable interpolation ───────────────────────────────────────────────────

function interpolateVars(value: string, defines: Record<string, string>): string {
  return value.replace(/\$\{(\w+)\}/g, (_m, name: string) => defines[name] ?? _m);
}

// ── Single-pass state machine ────────────────────────────────────────────────

const KNOWN_KEYS = new Set<string>(ALL_KNOWN_KEYS);

interface FnAccum {
  name:   string;
  params: string;
  inline: boolean;
  lines:  string[];
}

interface ParseCtx {
  defines:      Record<string, string>;
  condStack:    boolean[];
  fn:           FnAccum | null;
  recentOuter:  string[];
  projectName:  string;
  frontmatter:  Record<string, string>;
  lineMap:      Record<string, number>;
  systemPrompt: string;
  skills:       ParsedSkill[];
  warnings:     FrontmatterWarning[];
  repoConfigs:  Record<string, string>;
  lineNum:      number;
  files:        Record<string, string>;
  repos:        Record<string, Record<string, string>>;
  visitedFiles: Set<string>;
  currentFile:  string;
  includeDepth: number;
}

// Resolve a repo include path, trying exact path then path + ".ca"
function resolveRepoContent(
  repos: Record<string, Record<string, string>>,
  alias: string,
  path: string
): { content: string } | { error: string } {
  const repo = repos[alias];
  if (!repo) return { error: `Unknown repo "${alias}"` };
  const content = repo[path] ?? repo[path + ".ca"];
  if (content === undefined) return { error: `File "${path}" not found in repo "${alias}"` };
  return { content };
}

function ctxIsActive(ctx: ParseCtx): boolean {
  return ctx.condStack.length === 0 || ctx.condStack.every(Boolean);
}

function ctxCloseFunction(ctx: ParseCtx): void {
  const fn = ctx.fn!;
  ctx.fn   = null;
  ctx.recentOuter = [];
  const body = cleanBody(fn.lines.join("\n"));
  if (fn.name === "main") {
    // fn main() inside an included file does not overwrite the parent agent's system prompt
    if (ctx.includeDepth === 0) ctx.systemPrompt = body;
  } else {
    ctx.skills.push({ name: fn.name, params: fn.params, body, inline: fn.inline });
  }
}

function pushOuter(ctx: ParseCtx, line: string): void {
  ctx.recentOuter.push(line);
  if (ctx.recentOuter.length > 3) ctx.recentOuter.shift();
}

function ctxFeedLine(line: string, ctx: ParseCtx): void {
  ctx.lineNum++;

  // Inside a function body — checked FIRST.
  // Bodies are indentation-delimited: any non-blank, column-0 line closes the body,
  // EXCEPT #if/#endif which are always treated as body conditionals regardless of indent.
  // } closes silently; any other column-0 line closes AND is re-processed.
  // #include expands the referenced file. // lines are stripped.
  // Everything else accumulates as literal body content.
  if (ctx.fn) {
    // #if/#endif at any indentation level (including column 0) act as body conditionals
    let bm: RegExpMatchArray | null;
    bm = line.match(/^[ \t]*#if\s+(\w+)\s*==\s*(\S+)/);
    if (bm) { ctx.condStack.push(ctxIsActive(ctx) && (ctx.defines[bm[1]!] ?? "") === bm[2]!); return; }
    bm = line.match(/^[ \t]*#if\s+(\w+)\s*!=\s*(\S+)/);
    if (bm) { ctx.condStack.push(ctxIsActive(ctx) && (ctx.defines[bm[1]!] ?? "") !== bm[2]!); return; }
    if (/^[ \t]*#endif\b/.test(line)) { ctx.condStack.pop(); return; }
    // Non-blank column-0 line (other than #if/#endif) → close the body
    if (line !== "" && !/^[ \t]/.test(line)) {
      if (!ctxIsActive(ctx)) return; // skip col-0 lines inside inactive blocks
      ctxCloseFunction(ctx);
      if (!/^\}\s*$/.test(line)) ctxFeedLine(line, ctx); // re-process non-} lines
      return;
    }
    // Empty line → pass through to body
    if (line === "") { ctx.fn.lines.push(line); return; }
    // Indented line: skip if inactive, then process #include and //
    if (!ctxIsActive(ctx)) return;
    bm = line.match(/^([ \t]+)#include\s+"([^"]+)"\s*$/);
    if (bm) {
      const indent   = bm[1]!;
      const rawPath  = bm[2]!;
      const resolved = normalizePath(
        rawPath.startsWith("/") ? rawPath.slice(1) : parentDir(ctx.currentFile) + rawPath
      );
      if (!ctx.visitedFiles.has(resolved)) {
        const content = ctx.files[resolved];
        if (content === undefined) {
          ctx.warnings.push({ key: "#include", value: rawPath, message: `File not found: "${rawPath}"`, line: ctx.lineNum });
        } else if (resolved.endsWith(".md")) {
          const prevVisited = ctx.visitedFiles;
          ctx.visitedFiles  = new Set([...ctx.visitedFiles, resolved]);
          const parsed = parseMdContent(content);
          if (parsed.type === "skill") {
            ctx.skills.push({ name: parsed.name, params: parsed.params, body: parsed.body, inline: false });
          } else {
            for (const l of splitLines(parsed.text)) {
              ctx.fn!.lines.push(interpolateVars(l, ctx.defines));
            }
          }
          ctx.visitedFiles = prevVisited;
        } else {
          const prevFile    = ctx.currentFile;
          const prevVisited = ctx.visitedFiles;
          const prevLine    = ctx.lineNum;
          ctx.currentFile   = resolved;
          ctx.visitedFiles  = new Set([...ctx.visitedFiles, resolved]);
          ctx.lineNum       = 0;
          for (const l of splitLines(content)) {
            // Prefix column-0 lines with the same whitespace as the #include
            // line so indentation stays consistent with the rest of the body.
            ctxFeedLine(l !== "" && !/^[ \t]/.test(l) ? indent + l : l, ctx);
          }
          ctx.currentFile   = prevFile;
          ctx.visitedFiles  = prevVisited;
          ctx.lineNum       = prevLine;
        }
      }
      return;
    }
    bm = line.match(/^([ \t]+)#include\s+<([\w-]+)\/([^>\s]+)>\s*$/);
    if (bm) {
      const indent = bm[1]!, alias = bm[2]!, path = bm[3]!;
      const refKey = `<${alias}/${path}>`;
      if (!ctx.visitedFiles.has(refKey)) {
        const result = resolveRepoContent(ctx.repos, alias, path);
        if ("error" in result) {
          ctx.warnings.push({ key: "#include", value: refKey, message: result.error, line: ctx.lineNum });
        } else {
          const prevFile    = ctx.currentFile;
          const prevVisited = ctx.visitedFiles;
          const prevLine    = ctx.lineNum;
          ctx.currentFile   = refKey;
          ctx.visitedFiles  = new Set([...ctx.visitedFiles, refKey]);
          ctx.lineNum       = 0;
          for (const l of splitLines(result.content)) {
            ctxFeedLine(l !== "" && !/^[ \t]/.test(l) ? indent + l : l, ctx);
          }
          ctx.currentFile   = prevFile;
          ctx.visitedFiles  = prevVisited;
          ctx.lineNum       = prevLine;
        }
      }
      return;
    }
    const bodyLine = line.startsWith("\t") ? line.slice(1) : line;
    if (/^\s*\/\//.test(bodyLine)) return;
    // #def inside a body sets a variable (silently, no output, no frontmatter)
    const dm = bodyLine.match(/^\s*#def\s+(\w+)\s+(.+)/);
    if (dm && dm[1] && dm[2]) {
      ctx.defines[dm[1]] = interpolateVars(dm[2].trim(), ctx.defines);
      return;
    }
    ctx.fn.lines.push(interpolateVars(line, ctx.defines));
    return;
  }

  // Conditional directives — only evaluated at top level (outside fn bodies)
  let m: RegExpMatchArray | null;

  m = line.match(/^#if\s+(\w+)\s*==\s*(\S+)/);
  if (m) { ctx.condStack.push(ctxIsActive(ctx) && (ctx.defines[m[1]!] ?? "") === m[2]!); return; }

  m = line.match(/^#if\s+(\w+)\s*!=\s*(\S+)/);
  if (m) { ctx.condStack.push(ctxIsActive(ctx) && (ctx.defines[m[1]!] ?? "") !== m[2]!); return; }

  if (/^#endif\b/.test(line)) { ctx.condStack.pop(); return; }

  if (!ctxIsActive(ctx)) return;

  // #include — inline the referenced file's lines
  m = line.match(/^#include\s+"([^"]+)"\s*$/);
  if (m) {
    const rawPath  = m[1]!;
    const resolved = normalizePath(
      rawPath.startsWith("/") ? rawPath.slice(1) : parentDir(ctx.currentFile) + rawPath
    );
    if (!ctx.visitedFiles.has(resolved)) {
      const content = ctx.files[resolved];
      if (content === undefined) {
        ctx.warnings.push({ key: "#include", value: rawPath, message: `File not found: "${rawPath}"`, line: ctx.lineNum });
      } else if (resolved.endsWith(".md")) {
        const prevVisited = ctx.visitedFiles;
        ctx.visitedFiles  = new Set([...ctx.visitedFiles, resolved]);
        const parsed = parseMdContent(content);
        if (parsed.type === "skill") {
          ctx.skills.push({ name: parsed.name, params: parsed.params, body: parsed.body, inline: false });
        } else {
          const prevFile = ctx.currentFile;
          const prevLine = ctx.lineNum;
          ctx.currentFile = resolved;
          ctx.lineNum     = 0;
          for (const l of splitLines(parsed.text)) ctxFeedLine(l, ctx);
          ctx.currentFile = prevFile;
          ctx.lineNum     = prevLine;
        }
        ctx.visitedFiles = prevVisited;
      } else {
        const prevFile    = ctx.currentFile;
        const prevVisited = ctx.visitedFiles;
        const prevLine    = ctx.lineNum;
        ctx.currentFile   = resolved;
        ctx.visitedFiles  = new Set([...ctx.visitedFiles, resolved]);
        ctx.lineNum       = 0;
        ctx.includeDepth++;
        for (const l of splitLines(content)) ctxFeedLine(l, ctx);
        ctx.includeDepth--;
        ctx.currentFile   = prevFile;
        ctx.visitedFiles  = prevVisited;
        ctx.lineNum       = prevLine;
      }
    }
    return;
  }

  // #include <alias/path> — repo include
  m = line.match(/^#include\s+<([\w-]+)\/([^>\s]+)>\s*$/);
  if (m) {
    const alias = m[1]!, path = m[2]!;
    const refKey = `<${alias}/${path}>`;
    if (!ctx.visitedFiles.has(refKey)) {
      const result = resolveRepoContent(ctx.repos, alias, path);
      if ("error" in result) {
        ctx.warnings.push({ key: "#include", value: refKey, message: result.error, line: ctx.lineNum });
      } else {
        const prevFile    = ctx.currentFile;
        const prevVisited = ctx.visitedFiles;
        const prevLine    = ctx.lineNum;
        ctx.currentFile   = refKey;
        ctx.visitedFiles  = new Set([...ctx.visitedFiles, refKey]);
        ctx.lineNum       = 0;
        ctx.includeDepth++;
        for (const l of splitLines(result.content)) ctxFeedLine(l, ctx);
        ctx.includeDepth--;
        ctx.currentFile   = prevFile;
        ctx.visitedFiles  = prevVisited;
        ctx.lineNum       = prevLine;
      }
    }
    return;
  }

  // #def key value
  m = line.match(/^#def\s+(\w+)\s+(.+)/);
  if (m && m[1] && m[2]) {
    const key = m[1], value = interpolateVars(m[2].trim(), ctx.defines);
    ctx.defines[key] = value;
    if (ctx.includeDepth === 0) {
      if (key === "name") {
        ctx.projectName = value;
      } else if (KNOWN_KEYS.has(key)) {
        ctx.frontmatter[key] = value;
        ctx.lineMap[key]     = ctx.lineNum;
      }
    }
    pushOuter(ctx, line);
    return;
  }

  // #pragma
  if (/^#pragma\b/.test(line)) { pushOuter(ctx, line); return; }

  // fn declaration — must start at column 0; { is optional
  m = line.match(/^fn[ \t]+(\w+)\s*\(([^)]*)\)\s*\{?/);
  if (m) {
    const inline = ctx.recentOuter.some(l => /^#pragma\s+inline\s*$/.test(l));
    ctx.fn = { name: m[1]!, params: m[2]!.trim(), inline, lines: [] };
    ctx.recentOuter = [];
    return;
  }

  // Legacy // key: value frontmatter
  m = line.match(/^\s*\/\/\s*([\w]+):\s*(.+)/);
  if (m && m[1] && m[2]) {
    const key = m[1], value = m[2].trim();
    if (key === "name") {
      if (!ctx.projectName || ctx.projectName === "my-agent") ctx.projectName = value;
    } else if (KNOWN_KEYS.has(key)) {
      ctx.frontmatter[key] = value;
      ctx.lineMap[key]     = ctx.lineNum;
    }
  }

  pushOuter(ctx, line);
}

function makeCtx(
  files: Record<string, string>,
  currentFile: string,
  repos: Record<string, Record<string, string>> = {}
): ParseCtx {
  return {
    defines: {}, condStack: [], fn: null, recentOuter: [],
    projectName: "my-agent", frontmatter: {}, lineMap: {}, systemPrompt: "", skills: [], warnings: [], repoConfigs: {},
    lineNum: 0, files, repos, visitedFiles: new Set([currentFile]), currentFile, includeDepth: 0,
  };
}

function finalizeCtx(ctx: ParseCtx): ParsedAgent {
  if (ctx.fn) ctxCloseFunction(ctx); // implicit close if no } or dedent at EOF
  const warnings: FrontmatterWarning[] = [];

  const result = FrontmatterSchema.safeParse(ctx.frontmatter);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      warnings.push({ key, value: ctx.frontmatter[key] ?? "", message: issue.message, line: ctx.lineMap[key] ?? 0 });
    }
  }

  const knownToolNames = TOOLS.map((t) => t.name).join(", ");
  for (const field of ["tools", "disallowedTools", "allowedTools"] as const) {
    const value = ctx.frontmatter[field];
    if (!value) continue;
    const lineNum = ctx.lineMap[field] ?? 0;
    for (const raw of value.split(",").map((t) => t.trim()).filter(Boolean)) {
      if (!isKnownTool(raw)) {
        warnings.push({ key: field, value: raw, message: `Unknown tool "${raw}". Known tools: ${knownToolNames}`, line: lineNum });
      }
    }
  }

  return { name: ctx.projectName, systemPrompt: ctx.systemPrompt, skills: ctx.skills, frontmatter: ctx.frontmatter, warnings: [...ctx.warnings, ...warnings] };
}

// ── Public parsing API ──────────────────────────────────────────────────────

/** Parse from any sync iterable of lines — no intermediate string allocations. */
export function parseCAgentLines(
  lines: Iterable<string>,
  files: Record<string, string> = {},
  currentFile = "main.ca",
  repos: Record<string, Record<string, string>> = {}
): ParsedAgent {
  const ctx = makeCtx(files, currentFile, repos);
  for (const line of lines) ctxFeedLine(line, ctx);
  return finalizeCtx(ctx);
}

/**
 * Parse from an async line iterable — suitable for streaming large files from disk.
 *
 * @example
 *   // Bun CLI — no need to load the whole file into memory:
 *   const agent = await parseCAgentStream(streamToLines(Bun.file(path).stream()));
 */
export async function parseCAgentStream(
  lines: AsyncIterable<string>,
  files: Record<string, string> = {},
  currentFile = "main.ca",
  repos: Record<string, Record<string, string>> = {}
): Promise<ParsedAgent> {
  const ctx = makeCtx(files, currentFile, repos);
  for await (const line of lines) ctxFeedLine(line, ctx);
  return finalizeCtx(ctx);
}

/** Convenience wrapper: parse a string synchronously (backward-compatible). */
export function parseCAgent(
  source: string,
  files?: Record<string, string>,
  currentFile = "main.ca",
  repos: Record<string, Record<string, string>> = {}
): ParsedAgent {
  return parseCAgentLines(splitLines(source), files ?? {}, currentFile, repos);
}

// ── Output helpers ──────────────────────────────────────────────────────────

function cleanBody(body: string): string {
  const lines = body.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return "";
  // Use minimum leading whitespace across all non-empty lines so that
  // content from nested #if blocks (deeper indent) doesn't skew stripping.
  const minIndent = nonEmpty
    .map((l) => l.match(/^([ \t]*)/)?.[1] ?? "")
    .reduce((a, b) => (a.length <= b.length ? a : b));
  return lines
    .map((l) => (minIndent && l.startsWith(minIndent) ? l.slice(minIndent.length) : l))
    .join("\n")
    .trim();
}

export function formatParams(params: string): string {
  if (!params || params === "void") return "";
  if (params.includes("(")) return params; // already formatted (e.g. from a .md skill file)
  return params
    .split(",")
    .map((p) => {
      const parts    = p.trim().split(/\s+/);
      if (parts.length < 2) return p.trim();
      const paramName = parts[parts.length - 1]!.replace(/^\*+/, "");
      const type      = parts.slice(0, -1).join(" ").replace(/\*+$/, "").trim();
      const typeMap: Record<string, string> = {
        str: "string", int: "number", float: "number", double: "number", bool: "boolean",
      };
      return `${paramName} (${typeMap[type] ?? type})`;
    })
    .join(", ");
}

export interface GeneratedFile {
  path: string;
  content: string;
}
