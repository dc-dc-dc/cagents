import { test, expect, describe } from "bun:test";
import { resolveTools } from "./compat";

describe("resolveTools — kiro deduplication", () => {
  test("Read + Glob + Grep + LS + NotebookRead all → single 'read'", () => {
    const resolved = resolveTools("Read, Glob, Grep, LS, NotebookRead", "kiro");
    expect(resolved).toEqual(["read"]);
  });

  test("Write + Edit + MultiEdit + NotebookEdit all → single 'write'", () => {
    const resolved = resolveTools("Write, Edit, MultiEdit, NotebookEdit", "kiro");
    expect(resolved).toEqual(["write"]);
  });
});

describe("resolveTools — gemini deduplication", () => {
  test("Write + Edit + MultiEdit all → single 'write_file'", () => {
    const resolved = resolveTools("Write, Edit, MultiEdit", "gemini");
    expect(resolved).toEqual(["write_file"]);
  });
});

describe("resolveTools — codex mapping", () => {
  test("all filesystem tools → single 'shell' (deduplicated)", () => {
    const resolved = resolveTools("Read, Write, Bash, Glob", "codex");
    expect(resolved).toEqual(["shell"]);
  });

  test("WebSearch → web_search", () => {
    expect(resolveTools("WebSearch", "codex")).toEqual(["web_search"]);
  });

  test("WebFetch → web_fetch", () => {
    expect(resolveTools("WebFetch", "codex")).toEqual(["web_fetch"]);
  });

  test("TodoRead/TodoWrite → empty (omitted)", () => {
    expect(resolveTools("TodoRead, TodoWrite, Task", "codex")).toEqual([]);
  });
});
