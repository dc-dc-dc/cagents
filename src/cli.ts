#!/usr/bin/env bun
import { runCLI } from "./compiler/cli-core";
import type { IO } from "./compiler/cli-core";

const io: IO = {
  readFile: (path) => Bun.file(path).text(),
  writeFile: (path, content) => Bun.write(path, content).then(() => {}),
  exists: (path) => Bun.file(path).exists(),
  mkdir: async (dir) => { await Bun.$`mkdir -p ${dir}`.quiet(); },
  spawn: async (cmd) => {
    const proc = Bun.spawn(cmd, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    const code = await proc.exited;
    if (code !== 0) process.exit(code);
  },
};

await runCLI(io, process.argv.slice(2));
