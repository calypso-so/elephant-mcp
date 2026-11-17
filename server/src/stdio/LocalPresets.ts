import { ToolPreset } from "../presets/ToolPreset.js";
import { ToolPresetRegistry } from "../presets/ToolPresetRegistry.js";

/**
 * Both tool sets in one local server.
 *
 * The hosted server splits reading and writing into two endpoints so a
 * ChatGPT user consents to each. A local server runs under the key owner's
 * own account, so it publishes everything by default and hatches like
 * Elephant does. It is never served over HTTP: the registry does not list it.
 */
const all = new ToolPreset({
  id: "all",
  path: "/elephant/local",
  serverName: "elephant",
  displayName: "Elephant by Calypso",
  scope: "",
  instructions: [
    ToolPresetRegistry.elephant.instructions.replace(
      " To add files or websites, use Elephant Builder by Calypso.",
      "",
    ),
    "It can also add files and websites to the team's knowledge buckets and create new buckets; confirm the destination bucket with the user before adding content.",
  ].join(" "),
  tools: [
    ...ToolPresetRegistry.elephant.tools,
    ...ToolPresetRegistry.elephantBuilder.tools,
  ],
  hatches: true,
});

/** The preset a local server runs, by the id given on the command line. */
export function localPreset(id: string): ToolPreset {
  if (id === "all") return all;
  const preset = ToolPresetRegistry.byId(id);
  if (!preset) {
    const known = ["all", ...ToolPresetRegistry.all().map((p) => p.id)];
    throw new Error(`Unknown preset "${id}". Use one of: ${known.join(", ")}.`);
  }
  return preset;
}
