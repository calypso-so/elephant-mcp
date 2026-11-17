import { AddFilesTool } from "../tools/AddFilesTool.js";
import { AddFileTool } from "../tools/AddFileTool.js";
import { AddWebsiteTool } from "../tools/AddWebsiteTool.js";
import { AskTool } from "../tools/AskTool.js";
import { CreateBucketTool } from "../tools/CreateBucketTool.js";
import { ListBucketsTool } from "../tools/ListBucketsTool.js";
import { OpenSourceTool } from "../tools/OpenSourceTool.js";
import { SearchTool } from "../tools/SearchTool.js";
import { ToolPreset } from "./ToolPreset.js";

/** Elephant by Calypso — read-only, cited answers. */
const elephant = new ToolPreset({
  id: "elephant",
  path: "/elephant/mcp",
  serverName: "elephant",
  displayName: "Elephant by Calypso",
  scope: "elephant:read",
  instructions: [
    "Elephant by Calypso answers from this team's Calypso knowledge — the documents, websites and images the team has added — and cites every source.",
    "It is read-only: it cannot add, change or delete knowledge. To add files or websites, use Elephant Builder by Calypso.",
    "When the knowledge does not cover a question, say so instead of answering from general knowledge.",
  ].join(" "),
  tools: [
    new AskTool(),
    new SearchTool(),
    new ListBucketsTool(),
    new OpenSourceTool(),
  ],
  hatches: true,
});

/** Elephant Builder by Calypso — adds sources and buckets. */
const elephantBuilder = new ToolPreset({
  id: "elephant-builder",
  path: "/elephant/builder/mcp",
  serverName: "elephant-builder",
  displayName: "Elephant Builder by Calypso",
  scope: "elephant:write",
  instructions: [
    "Elephant Builder by Calypso adds files and websites to this team's Calypso knowledge buckets and creates new buckets.",
    "It does not answer questions; use Elephant by Calypso to ask about the knowledge once it is added.",
    "Confirm the destination bucket with the user before adding content.",
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
