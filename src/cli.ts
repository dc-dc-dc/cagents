#!/usr/bin/env bun
import { runCLI } from "./compiler/cli-core";
import type { IO } from "./compiler/cli-core";

const io: IO = {
  readFile: (path) => Bun.file(path).text(),
  writeFile: (path, content) => Bun.write(path, content).then(() => {}),
  exists: (path) => Bun.file(path).exists(),
  mkdir: async (dir) => { await Bun.$`mkdir -p ${dir}`.quiet(); },
};

await runCLI(io, process.argv.slice(2));
