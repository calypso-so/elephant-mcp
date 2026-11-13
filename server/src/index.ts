#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { composeHostedServer } from "./http/HostedServer.js";
import { HttpConfig } from "./http/HttpConfig.js";

type PackageInfo = { name: string; version: string };

async function loadPackageInfo(): Promise<PackageInfo> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, "..", "package.json"), "utf8");
  const { name, version } = JSON.parse(raw) as PackageInfo;
  return { name, version };
}

async function main(): Promise<void> {
  dotenv.config();
  const packageInfo = await loadPackageInfo();
  const config = HttpConfig.fromEnv(process.env);
  composeHostedServer(config, packageInfo)
    .createNodeServer()
    .listen(config.port, () => {
      console.log(
        `Elephant MCP ${packageInfo.version} listening on :${config.port} as ${config.publicBaseUrl}; OAuth ${config.oauthEnabled ? "on" : "off"}`,
      );
    });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
