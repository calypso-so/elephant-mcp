// MCP tool name. Renamed from "calypso-rag-agent" in v2.4.0 to match the
// canonical model family; clients discover tools dynamically, so the rename
// reaches them on their next tools/list.
export const CALYPSO_AGENT = "calypso-agent";
export const CALYPSO_LIST_BUCKETS = "calypso-list-buckets";
export const CALYPSO_UPLOAD_FILE = "calypso-upload-file";
export const CALYPSO_UPLOAD_FILES_BATCH = "calypso-upload-files-batch";
export const CALYPSO_GET_FILE = "calypso-get-file";
export const CALYPSO_CREATE_BUCKET = "calypso-create-bucket";
export const CALYPSO_ADD_WEBSITE = "calypso-add-website";
export const CALYPSO_SEARCH = "calypso-search";

/**
 * Every tool this server registers, in the order clients see them.
 *
 * The calypso://server-info resource had its own hand-written copy of this list
 * and had fallen out of step — calypso-add-website was registered but missing
 * from it, so an agent introspecting the server never learned URL ingestion
 * existed. One list, asserted against the registrations in tests/server-info.
 */
export const CALYPSO_TOOLS = [
  CALYPSO_AGENT,
  CALYPSO_SEARCH,
  CALYPSO_LIST_BUCKETS,
  CALYPSO_GET_FILE,
  CALYPSO_UPLOAD_FILE,
  CALYPSO_UPLOAD_FILES_BATCH,
  CALYPSO_ADD_WEBSITE,
  CALYPSO_CREATE_BUCKET,
] as const;

export type CalypsoToolName = (typeof CALYPSO_TOOLS)[number];

// Model ids are a different namespace from tool names — they only ever looked
// alike by coincidence, and the 2026-08 rename pulled them apart.
export const DEFAULT_AGENT_MODEL_ID = "calypso-agent";

export const DEFAULT_CALYPSO_API_BASE_URL = "https://api.calypso.so/v1";

export type CalypsoRuntimeConfig = {
  /** Calypso project API key every tool call is made with. */
  apiKey?: string;
  /** Calypso API base URL, ending in /v1. */
  apiBaseUrl: string;
  /**
   * Whether upload tools may read `filePath` from disk. Always false here:
   * Elephant is hosted, and a caller-supplied path would read the server's
   * own filesystem.
   */
  localFileAccess?: boolean;
};
