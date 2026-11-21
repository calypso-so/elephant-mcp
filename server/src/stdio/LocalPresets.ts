import { ToolGroup } from "../presets/ToolGroup.js";
import { ToolPreset } from "../presets/ToolPreset.js";
import { ToolPresetRegistry } from "../presets/ToolPresetRegistry.js";

/**
 * Everything, for the key in the environment.
 *
 * The same tools as the hosted Elephant endpoint, without OAuth: a local
 * server runs under the key owner's own account, so there is no consent to
 * narrow it and the Calypso API decides what the key may do. It is never
 * served over HTTP: the registry does not list it.
 */
const all = new ToolPreset({
  id: "all",
  path: "/elephant/local",
  serverName: "elephant",
  displayName: "Elephant by Calypso",
  scope: "",
  instructions: ToolPresetRegistry.elephant.instructions,
  tools: [...ToolPresetRegistry.elephant.tools],
  hatches: true,
});

/**
 * Reading only, as `--preset elephant` has always meant on a local server.
 *
 * The hosted Elephant endpoint grew the saving and organising tools, offered
 * by consent. A local server has no consent step, so someone who pinned this
 * preset to keep their assistant from changing anything must keep getting
 * exactly that.
 */
const readOnly = new ToolPreset({
  id: "elephant",
  path: "/elephant/local/read",
  serverName: "elephant",
  displayName: "Elephant by Calypso",
  scope: "",
  instructions: ToolPresetRegistry.elephant.instructions,
  tools: ToolPresetRegistry.elephant.tools.filter(
    (tool) => tool.group === ToolGroup.read,
  ),
  hatches: true,
});

/** The preset a local server runs, by the id given on the command line. */
export function localPreset(id: string): ToolPreset {
  if (id === "all") return all;
  if (id === readOnly.id) return readOnly;
  const preset = ToolPresetRegistry.byId(id);
  if (!preset) {
    const known = ["all", ...ToolPresetRegistry.all().map((p) => p.id)];
    throw new Error(`Unknown preset "${id}". Use one of: ${known.join(", ")}.`);
  }
  return preset;
}
