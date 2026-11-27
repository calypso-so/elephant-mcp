#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Cli } from "./Cli.js";

// Compiled to dist/tools/plugin/main.js; the repository root is three levels up.
const own = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

try {
  const { root, rest } = Cli.takeRoot(process.argv.slice(2));
  process.exitCode = await new Cli({ root: root ? resolve(root) : own }).run(rest);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(Cli.USAGE);
  process.exitCode = 2;
}
