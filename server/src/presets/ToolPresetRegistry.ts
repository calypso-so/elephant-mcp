import { AddFilesTool } from "../tools/AddFilesTool.js";
import { AddFileTool } from "../tools/AddFileTool.js";
import { AddWebsiteTool } from "../tools/AddWebsiteTool.js";
import { AskTool } from "../tools/AskTool.js";
import { CreateBucketTool } from "../tools/CreateBucketTool.js";
import { ListBucketsTool } from "../tools/ListBucketsTool.js";
import { MoveSourcesTool } from "../tools/MoveSourcesTool.js";
import { OpenSourceTool } from "../tools/OpenSourceTool.js";
import { RenameBucketTool } from "../tools/RenameBucketTool.js";
import { SearchTool } from "../tools/SearchTool.js";
import { ToolGroup } from "./ToolGroup.js";
import { ToolPreset } from "./ToolPreset.js";

/**
 * Elephant by Calypso: everything in one place. Asking and searching for
 * every caller; saving and organising for those who allowed it.
 */
const elephant = new ToolPreset({
  id: "elephant",
  path: "/elephant/mcp",
  serverName: "elephant",
  displayName: "Elephant by Calypso",
  scope: ToolGroup.read.scope,
  instructions: [
    "Elephant by Calypso answers from this team's Calypso knowledge — the documents, websites and images the team has added — and cites every source.",
    "Answers and searches have a depth. Start shallow and go one step deeper only when a result is thin or says the knowledge does not cover something the user expects: `depth` on elephant-ask (`fast`, `balanced`, `deep`) and on elephant-search (`fast`, `thorough`, with `alsoSearchFor`).",
    "When the knowledge does not cover a question, say so instead of answering from general knowledge.",
  ].join(" "),
  tools: [
    new AskTool(),
    new SearchTool(),
    new ListBucketsTool(),
    new OpenSourceTool(),
    new AddFileTool(),
    new AddFilesTool(),
    new AddWebsiteTool(),
    new CreateBucketTool(),
    new RenameBucketTool(),
    new MoveSourcesTool(),
  ],
  hatches: true,
});

/**
 * Elephant Builder by Calypso — adds sources and buckets.
 *
 * Kept for the connections that already use it. Elephant now offers the same
 * tools on its own endpoint, so nothing new is built on this one.
 */
const elephantBuilder = new ToolPreset({
  id: "elephant-builder",
  path: "/elephant/builder/mcp",
  serverName: "elephant-builder",
  displayName: "Elephant Builder by Calypso",
  scope: ToolGroup.add.scope,
  instructions: [
    "Elephant Builder by Calypso adds files and websites to this team's Calypso knowledge buckets and creates new buckets.",
    "It does not answer questions; use Elephant by Calypso to ask about the knowledge once it is added.",
  ].join(" "),
  tools: [
    new AddFileTool(),
    new AddFilesTool(),
    new AddWebsiteTool(),
    new CreateBucketTool(),
  ],
});

const ALL: readonly ToolPreset[] = [elephant, elephantBuilder];

/** Every published surface, declared explicitly. */
export const ToolPresetRegistry = Object.freeze({
  elephant,
  elephantBuilder,
  all: (): ToolPreset[] => [...ALL],
  byId: (id: string): ToolPreset | undefined =>
    ALL.find((preset) => preset.id === id),
});
