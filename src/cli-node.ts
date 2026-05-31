#!/usr/bin/env node
import { runCLI } from "./compiler/cli-core";
import type { IO } from "./compiler/cli-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn as spawnProcess } from "node:child_process";

const io: IO = {
  readFile: (path) => Promise.resolve(readFileSync(path, "utf8")),
  writeFile: (path, content) => { writeFileSync(path, content, "utf8"); return Promise.resolve(); },
  exists: (path) => Promise.resolve(existsSync(path)),
  mkdir: (dir) => { mkdirSync(dir, { recursive: true }); return Promise.resolve(); },
  spawn: (cmd) => new Promise((resolve, reject) => {
    const proc = spawnProcess(cmd[0]!, cmd.slice(1), { stdio: "inherit" });
    proc.on("exit", (code) => { if (code !== 0) process.exit(code ?? 1); else resolve(); });
    proc.on("error", reject);
  }),
};

runCLI(io, process.argv.slice(2));
