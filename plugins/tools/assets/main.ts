#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetCatalog } from "./AssetCatalog.js";

// Compiled to dist/tools/assets/main.js; the repository root is three levels up.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

AssetCatalog.generate(root, (line) => console.log(line));
