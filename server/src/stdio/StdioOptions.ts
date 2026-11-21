import { DEFAULT_CALYPSO_API_BASE_URL } from "../calypso/CalypsoApiConfig.js";

export type StdioOptions = {
  /** Preset id: `elephant`, `elephant-builder`, or `all` (both tool sets). */
  readonly preset: string;
  readonly apiKey: string | undefined;
  readonly apiBaseUrl: string;
  readonly help: boolean;
  readonly version: boolean;
};

export const USAGE = `Usage: elephant-mcp [--preset elephant|elephant-builder|all]

Runs Elephant by Calypso as a local MCP server over stdio.

Environment:
  CALYPSO_API_KEY        your Calypso API key (required)
  CALYPSO_API_BASE_URL   Calypso API base URL, ending in /v1
                         (default ${DEFAULT_CALYPSO_API_BASE_URL})
  ELEPHANT_PRESET        default for --preset (default all)

Options:
  --preset <id>   which tools to publish: elephant (read only),
                  elephant-builder (add only) or all (read, add and
                  organise; the default)
  --version       print the version and exit
  --help          print this help and exit
`;

/**
 * Settings for the local stdio server: flags first, then env, then defaults.
 *
 * The key is read from the environment only, never from a flag, so it does
 * not show up in a process list or a shell history.
 */
export function parseStdioOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): StdioOptions {
  let preset = env.ELEPHANT_PRESET?.trim() || "all";
  let help = false;
  let version = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--version" || arg === "-v") version = true;
    else if (arg === "--preset") {
      const value = argv[i + 1]?.trim();
      if (!value) throw new Error("--preset needs a value.");
      preset = value;
      i += 1;
    } else if (arg.startsWith("--preset=")) {
      preset = arg.slice("--preset=".length).trim();
      if (!preset) throw new Error("--preset needs a value.");
    } else throw new Error(`Unknown option: ${arg}`);
  }
  const apiBaseUrl =
    env.CALYPSO_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_CALYPSO_API_BASE_URL;
  if (!apiBaseUrl.endsWith("/v1")) {
    throw new Error("CALYPSO_API_BASE_URL must end in /v1.");
  }
  return {
    preset,
    apiKey: env.CALYPSO_API_KEY?.trim() || undefined,
    apiBaseUrl,
    help,
    version,
  };
}
