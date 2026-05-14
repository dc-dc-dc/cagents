#!/usr/bin/env node
import { runCLI } from "./compiler/cli-core";
import type { IO } from "./compiler/cli-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const io: IO = {
  readFile: (path) => Promise.resolve(readFileSync(path, "utf8")),
  writeFile: (path, content) => { writeFileSync(path, content, "utf8"); return Promise.resolve(); },
  exists: (path) => Promise.resolve(existsSync(path)),
  mkdir: (dir) => { mkdirSync(dir, { recursive: true }); return Promise.resolve(); },
};

runCLI(io, process.argv.slice(2));
