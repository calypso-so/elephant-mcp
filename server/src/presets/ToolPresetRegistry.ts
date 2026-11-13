import {
  CALYPSO_ADD_WEBSITE,
  CALYPSO_AGENT,
  CALYPSO_CREATE_BUCKET,
  CALYPSO_GET_FILE,
  CALYPSO_LIST_BUCKETS,
  CALYPSO_SEARCH,
  CALYPSO_UPLOAD_FILE,
  CALYPSO_UPLOAD_FILES_BATCH,
} from "../config.js";
import {
  ELEPHANT_ADD_FILE,
  ELEPHANT_ADD_FILES,
  ELEPHANT_ADD_WEBSITE,
  ELEPHANT_ASK,
  ELEPHANT_BUILDER_INSTRUCTIONS,
  ELEPHANT_CREATE_BUCKET,
  ELEPHANT_INSTRUCTIONS,
  ELEPHANT_LIST_BUCKETS,
  ELEPHANT_OPEN_SOURCE,
  ELEPHANT_SEARCH,
} from "./elephantCopy.js";
import { ToolPreset } from "./ToolPreset.js";

/**
 * Every published surface, declared explicitly.
 *
 * No preset is derived from "all tools": adding a tool to the server must not
 * leak it onto a branded plugin until someone adds it here on purpose.
 */
/** Elephant by Calypso — read-only, cited answers. */
const elephant = new ToolPreset({
  id: "elephant",
  path: "/elephant/mcp",
  serverName: "elephant",
  displayName: "Elephant by Calypso",
  instructions: ELEPHANT_INSTRUCTIONS,
  scope: "elephant:read",
  tools: [
    [CALYPSO_AGENT, ELEPHANT_ASK],
    [CALYPSO_SEARCH, ELEPHANT_SEARCH],
    [CALYPSO_LIST_BUCKETS, ELEPHANT_LIST_BUCKETS],
    [CALYPSO_GET_FILE, ELEPHANT_OPEN_SOURCE],
  ],
});

/** Elephant Builder by Calypso — adds sources and buckets. */
const elephantBuilder = new ToolPreset({
  id: "elephant-builder",
  path: "/elephant/builder/mcp",
  serverName: "elephant-builder",
  displayName: "Elephant Builder by Calypso",
  instructions: ELEPHANT_BUILDER_INSTRUCTIONS,
  scope: "elephant:write",
  tools: [
    [CALYPSO_UPLOAD_FILE, ELEPHANT_ADD_FILE],
    [CALYPSO_UPLOAD_FILES_BATCH, ELEPHANT_ADD_FILES],
    [CALYPSO_ADD_WEBSITE, ELEPHANT_ADD_WEBSITE],
    [CALYPSO_CREATE_BUCKET, ELEPHANT_CREATE_BUCKET],
  ],
});

const ALL: readonly ToolPreset[] = [elephant, elephantBuilder];

/**
 * Every published surface, declared explicitly.
 *
 * No preset is derived from "all tools": adding a tool to the server must not
 * leak it onto a branded plugin until someone adds it here on purpose.
 */
export const ToolPresetRegistry = Object.freeze({
  elephant,
  elephantBuilder,
  all: (): ToolPreset[] => [...ALL],
  byId: (id: string): ToolPreset | undefined =>
    ALL.find((preset) => preset.id === id),
});
