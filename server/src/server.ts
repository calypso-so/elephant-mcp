import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

import { createKnowledgeBucket, listKnowledgeBuckets } from "./buckets.js";
import { HostedUploadPolicy } from "./catalog/HostedUploadPolicy.js";
import { ToolCatalog } from "./catalog/ToolCatalog.js";
import {
  CALYPSO_ADD_WEBSITE,
  CALYPSO_AGENT,
  CALYPSO_CREATE_BUCKET,
  CALYPSO_GET_FILE,
  CALYPSO_LIST_BUCKETS,
  CALYPSO_SEARCH,
  CALYPSO_UPLOAD_FILE,
  CALYPSO_UPLOAD_FILES_BATCH,
  type CalypsoRuntimeConfig,
} from "./config.js";
import {
  getKnowledgeFile,
  uploadKnowledgeFile,
  uploadKnowledgeFilesBatch,
} from "./files.js";
import {
  type CalypsoRagModelCatalog,
  loadRagModelCatalog,
  modelIdsFromCatalog,
} from "./models.js";
import type { ToolPreset } from "./presets/ToolPreset.js";
import { searchKnowledge } from "./search.js";
import { addKnowledgeWebsite } from "./websites.js";

type RagPromptParams = {
  prompt: string;
  fileIds?: string[];
  model?: string;
};

type UploadKnowledgeFileToolParams = {
  filename?: string;
  mimeType?: string;
  filePath?: string;
  sourceUrl?: string;
  contentBase64?: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  bucketIds?: string[];
  bucketSlugs?: string[];
  bucket?: string;
  createMissingBuckets?: boolean;
  idempotencyKey?: string;
  waitForIndexing?: boolean;
};

type UploadKnowledgeFilesBatchToolItemParams = {
  filename: string;
  mimeType: string;
  filePath?: string;
  contentBase64?: string;
  clientFileId?: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  bucketIds?: string[];
  bucketSlugs?: string[];
  bucket?: string;
  createMissingBuckets?: boolean;
};

type UploadKnowledgeFilesBatchToolParams = {
  items: UploadKnowledgeFilesBatchToolItemParams[];
  batchIdempotencyKey?: string;
  bucketIds?: string[];
  bucketSlugs?: string[];
  bucket?: string;
  createMissingBuckets?: boolean;
  waitForBatchReady?: boolean;
};

type ListKnowledgeBucketsToolParams = {
  includeArchived?: boolean;
};

type PackageInfo = {
  name: string;
  version: string;
};

type LogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

type CalypsoResponsesRequest = Omit<
  ResponseCreateParamsStreaming,
  "input" | "metadata"
> & {
  input: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  conversation?: string | { id: string };
  previous_response_id?: string;
};

async function processStreamingResponse(
  stream: AsyncIterable<ResponseStreamEvent>,
): Promise<{ text: string; responseId: string | null }> {
  let fullResponse = "";
  let responseId: string | null = null;

  for await (const event of stream) {
    if (
      event.type === "response.output_text.delta" &&
      typeof event.delta === "string"
    ) {
      fullResponse += event.delta;
    }

    if (
      event.type === "response.output_text.done" &&
      !fullResponse &&
      typeof event.text === "string"
    ) {
      fullResponse = event.text;
    }

    if (
      event.type === "response.completed" &&
      typeof event.response?.id === "string"
    ) {
      responseId = event.response.id;
    }
  }

  return { text: fullResponse, responseId };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function normalizeFileIds(fileIds?: string[]): string[] | undefined {
  const normalized = (fileIds || [])
    .map((fileId) => String(fileId || "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function buildResponsesMetadata(options: {
  conversationId: string;
  fileIds?: string[];
  modelId: string;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    tool: "mcp",
    agent: options.modelId,
    conversation_id: options.conversationId,
  };

  if (options.fileIds && options.fileIds.length > 0) {
    metadata._aicore = {
      file_input_strategy: "rag_policy",
    };
  }

  return metadata;
}

function requireApiKey(config: CalypsoRuntimeConfig): string {
  const apiKey = String(config.apiKey || "").trim();
  if (!apiKey) {
    throw new Error(
      "CALYPSO_API_KEY is required to call Calypso tools, but it is not configured.",
    );
  }

  return apiKey;
}

/**
 * Builds the MCP server for one Elephant preset, bound to one caller's
 * Calypso API key. Tools are declared once under their canonical operation
 * ids and published through the preset under their Elephant names.
 */
export function createElephantMcpServer(options: {
  config: CalypsoRuntimeConfig;
  modelCatalog: CalypsoRagModelCatalog;
  packageInfo: PackageInfo;
  preset: ToolPreset;
}): McpServer {
  const { config, modelCatalog, packageInfo, preset } = options;
  let calypsoClient: OpenAI | null = null;
  // The catalog is mutable state, not a startup constant: it refreshes on every
  // `calypso://rag-agent-models` read and after `calypso-create-agent`, so a
  // variant created mid-session is immediately usable without reconnecting.
  let currentCatalog: CalypsoRagModelCatalog = modelCatalog;
  let discoveredModelIdSet = new Set(modelIdsFromCatalog(currentCatalog));

  async function refreshModelCatalog(): Promise<CalypsoRagModelCatalog> {
    try {
      currentCatalog = await loadRagModelCatalog(config);
      discoveredModelIdSet = new Set(modelIdsFromCatalog(currentCatalog));
    } catch {
      // Keep the last known-good catalog: a transient discovery failure must
      // never regress an already-working model list.
    }
    return currentCatalog;
  }

  async function notifyCatalogChanged(): Promise<void> {
    await refreshModelCatalog();
    // The event that invalidates client caches triggers the refresh signals.
    // Best-effort: transports without a connected client throw harmlessly.
    try {
      server.sendResourceListChanged();
      server.sendToolListChanged();
    } catch {
      /* not connected yet */
    }
  }

  function resolveRagModelId(value?: string): string {
    const requested = String(value || "").trim();
    // Only ids that discovery actually lists are accepted. The legacy
    // `calypso-rag-agent[:{id}]` family is no longer rewritten to the canonical
    // one; an unknown id fails loudly below and names the resource to consult.
    const modelId = requested || currentCatalog.defaultModel;
    if (!discoveredModelIdSet.has(modelId)) {
      throw new Error(
        `Unknown agent \`${modelId}\`. Available: ${[...discoveredModelIdSet].join(", ")}.`,
      );
    }
    return modelId;
  }

  function hasKnowledgeBucketDestination(value: {
    bucketIds?: string[];
    bucketSlugs?: string[];
    bucket?: string;
  }): boolean {
    return Boolean(
      (value.bucketIds || []).some((item) => String(item || "").trim()) ||
        (value.bucketSlugs || []).some((item) => String(item || "").trim()) ||
        String(value.bucket || "").trim(),
    );
  }

  function requireKnowledgeBucketDestination(
    value: {
      bucketIds?: string[];
      bucketSlugs?: string[];
      bucket?: string;
    },
    context: string,
  ): void {
    if (!hasKnowledgeBucketDestination(value)) {
      throw new Error(`${context} requires bucketIds, bucketSlugs, or bucket.`);
    }
  }

  function requireBatchBucketDestinations(
    value: UploadKnowledgeFilesBatchToolParams,
  ): void {
    if (hasKnowledgeBucketDestination(value)) return;
    const missing = value.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !hasKnowledgeBucketDestination(item))
      .map(
        ({ item, index }) =>
          item.clientFileId || item.filename || `item ${index + 1}`,
      );
    if (missing.length > 0) {
      throw new Error(
        `Batch knowledge uploads require a shared bucket destination or a bucket destination on every item. Missing: ${missing.join(", ")}`,
      );
    }
  }

  function getCalypsoClient(): OpenAI {
    if (!calypsoClient) {
      calypsoClient = new OpenAI({
        apiKey: requireApiKey(config),
        baseURL: config.apiBaseUrl,
        defaultHeaders: {
          "User-Agent": `${packageInfo.name}/${packageInfo.version} (Node.js/${process.versions.node})`,
        },
      });
    }

    return calypsoClient;
  }

  const server = new McpServer(
    {
      name: preset.serverName,
      title: preset.displayName,
      version: packageInfo.version,
    },
    {
      capabilities: {
        logging: {},
      },
      instructions: preset.instructions,
    },
  );
  const tools = new ToolCatalog(
    server,
    preset,
    new HostedUploadPolicy(config.localFileAccess !== false),
  );

  async function logEvent(
    level: LogLevel,
    message: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await server.server.sendLoggingMessage({
        level,
        logger: "calypso-mcp",
        data: {
          message,
          ...data,
        },
      });
    } catch {
      // Logging is best-effort and must never break tool execution.
    }
  }

  // MCP session state is intentionally per-process. The backend maintains the
  // real conversation thread through previous_response_id chaining.
  type ConversationState = {
    conversationId: string;
    previousResponseId: string | null;
  };
  const conversationStates = new Map<string, ConversationState>();

  function newConversationState(): ConversationState {
    return {
      conversationId: `conv_${randomUUID().replace(/-/g, "")}`,
      previousResponseId: null,
    };
  }

  function getConversationState(modelId: string): ConversationState {
    const existing = conversationStates.get(modelId);
    if (existing) {
      return existing;
    }
    const next = newConversationState();
    conversationStates.set(modelId, next);
    return next;
  }

  function resetConversationState(modelId: string): ConversationState {
    const next = newConversationState();
    conversationStates.set(modelId, next);
    return next;
  }

  tools.register(
    CALYPSO_SEARCH,
    {
      description: [
        "[CALYPSO SEARCH]",
        "Retrieval-only search over the team's grounded knowledge: returns the",
        "chunks and sources an agent answer would cite, without a synthesized",
        "answer. Use this when the caller wants raw evidence to reason over.",
        "",
        "Scope defaults to the default Calypso agent; pass `agent` for a named",
        "variant (calypso-agent:{agent_id}) or `buckets` (ids or slugs,",
        "up to 5) to search specific buckets directly — not both.",
      ].join("\n"),
      inputSchema: {
        query: z.string().min(1).describe("The search query."),
        agent: z
          .string()
          .optional()
          .describe(
            "Agent model id whose retrieval scope to search " +
              "(calypso-agent or calypso-agent:{agent_id}). " +
              "Mutually exclusive with buckets.",
          ),
        buckets: z
          .array(z.string())
          .max(5)
          .optional()
          .describe(
            "Bucket ids or slugs to search directly. Mutually exclusive with agent.",
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Maximum results to return (1-20, default 10)."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      query,
      agent,
      buckets,
      maxResults,
    }: {
      query: string;
      agent?: string;
      buckets?: string[];
      maxResults?: number;
    }) => {
      try {
        await logEvent("info", "Running Calypso knowledge search.", {
          tool: CALYPSO_SEARCH,
          hasAgent: Boolean(agent),
          bucketCount: buckets?.length ?? 0,
        });
        const result = await searchKnowledge(config, {
          query,
          agent,
          buckets,
          maxResults,
        });
        await logEvent("info", "Calypso knowledge search completed.", {
          tool: CALYPSO_SEARCH,
          strategy: result.strategy,
          resultCount: result.results.length,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: formatJson(result),
            },
          ],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_SEARCH}:`, error);
        await logEvent("error", "Calypso knowledge search failed.", {
          tool: CALYPSO_SEARCH,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Calypso knowledge search failed. ${error}`,
            },
          ],
        };
      }
    },
  );

  tools.register(
    CALYPSO_LIST_BUCKETS,
    {
      description: [
        "[CALYPSO LIST BUCKETS]",
        "Lists buckets for the team tied to the configured Calypso API key.",
        "",
        "Use this before uploads when you need bucket ids, slugs, names, member counts,",
        "or bucket-store readiness. This complements agent model discovery: model discovery",
        "shows which buckets are bound to each agent variant, while this tool lists all buckets for the API key team.",
      ].join("\n"),
      inputSchema: {
        includeArchived: z
          .boolean()
          .optional()
          .describe("If true, include archived buckets. Defaults to false."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ includeArchived }: ListKnowledgeBucketsToolParams) => {
      try {
        await logEvent("info", "Listing Calypso knowledge buckets.", {
          tool: CALYPSO_LIST_BUCKETS,
          includeArchived: includeArchived === true,
        });

        const bucketList = await listKnowledgeBuckets(config, {
          includeArchived,
        });

        await logEvent("info", "Calypso knowledge bucket listing completed.", {
          tool: CALYPSO_LIST_BUCKETS,
          teamId: bucketList.team_id || null,
          bucketCount: bucketList.buckets.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatJson(bucketList),
            },
          ],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_LIST_BUCKETS}:`, error);
        await logEvent("error", "Calypso knowledge bucket listing failed.", {
          tool: CALYPSO_LIST_BUCKETS,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to list Calypso knowledge buckets. ${error}`,
            },
          ],
        };
      }
    },
  );

  tools.register(
    CALYPSO_GET_FILE,
    {
      description: [
        "[CALYPSO GET FILE]",
        "Fetches one knowledge file's metadata and indexing status by file id.",
        "",
        "Use this to resolve the opaque `fileIds` returned by calypso-list-buckets",
        "into filename, mime type, size, indexing status, and per-bucket sync state.",
        "Pass verify=true to also ask the provider (Gemini) for ground truth about",
        "the indexed document — slower, but authoritative when status looks stale.",
      ].join("\n"),
      inputSchema: {
        fileId: z
          .string()
          .describe(
            "Knowledge file id, e.g. from calypso-list-buckets fileIds.",
          ),
        verify: z
          .boolean()
          .optional()
          .describe(
            "If true, verify against the provider (?verify=gemini). Slower.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ fileId, verify }: { fileId: string; verify?: boolean }) => {
      try {
        const file = await getKnowledgeFile(config, fileId, { verify });
        return {
          content: [{ type: "text" as const, text: formatJson(file) }],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_GET_FILE}:`, error);
        await logEvent("error", "Calypso file lookup failed.", {
          tool: CALYPSO_GET_FILE,
          fileId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to fetch the Calypso file. ${error}`,
            },
          ],
        };
      }
    },
  );

  const createdBucketOutput = {
    id: z.string().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
    status: z.string().optional(),
  };

  // structuredContent is validated strictly against the declared outputSchema
  // (additionalProperties: false), but the API payload grows fields over time.
  // Project the structured part onto the declared keys; the full payload stays
  // in the text content.
  const projectToSchema = (
    payload: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.keys(schema)
        .filter((field) => payload[field] !== undefined)
        .map((field) => [field, payload[field]]),
    );

  tools.register(
    CALYPSO_CREATE_BUCKET,
    {
      description: [
        "[CALYPSO CREATE BUCKET]",
        "Creates an empty bucket to upload files into later.",
        "",
        "Use this for the create-then-fill workflow; uploads can also create",
        "buckets implicitly via bucketSlugs + createMissingBuckets. The server",
        "normalizes the slug and returns 409 `bucket_slug_exists` on collision.",
        "Requires the `knowledge:bucket:create` capability on the API key and a",
        "backend with POST /v1/knowledge/buckets deployed.",
      ].join("\n"),
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(120)
          .describe("Human-readable bucket name."),
        slug: z
          .string()
          .optional()
          .describe(
            "Optional slug; server-normalized. Collision -> bucket_slug_exists.",
          ),
        description: z.string().optional().describe("Optional description."),
        idempotencyKey: z
          .string()
          .optional()
          .describe(
            "Optional Idempotency-Key; replays return the existing bucket.",
          ),
      },
      outputSchema: createdBucketOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: {
      name: string;
      slug?: string;
      description?: string;
      idempotencyKey?: string;
    }) => {
      try {
        const bucket = await createKnowledgeBucket(config, input);
        await logEvent("notice", "Calypso bucket created.", {
          tool: CALYPSO_CREATE_BUCKET,
          bucketId: (bucket as { id?: string }).id || null,
        });
        await notifyCatalogChanged();
        return {
          structuredContent: projectToSchema(
            bucket as Record<string, unknown>,
            createdBucketOutput,
          ),
          content: [{ type: "text" as const, text: formatJson(bucket) }],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_CREATE_BUCKET}:`, error);
        await logEvent("error", "Calypso bucket creation failed.", {
          tool: CALYPSO_CREATE_BUCKET,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to create the Calypso bucket. ${error}`,
            },
          ],
        };
      }
    },
  );

  tools.register(
    CALYPSO_ADD_WEBSITE,
    {
      description: [
        "[CALYPSO ADD WEBSITE]",
        "Ingests a website URL as bucket-scoped knowledge.",
        "",
        "One shot: the Calypso backend crawls the URL, generates the title,",
        "summary, and tags, persists the website as knowledge, and assigns it",
        "to the given buckets in the same call. The normalized URL is the",
        "create identity per team: a matching Idempotency-Key replays the",
        "existing website, and a collision without one is a typed",
        "`website_url_exists` conflict. Requires the",
        "`knowledge:website:create` capability (explicit-only) and a backend",
        "with POST /v1/knowledge/websites deployed.",
      ].join("\n"),
      inputSchema: {
        url: z
          .string()
          .describe(
            "Website URL to ingest. Normalized server-side; https:// is assumed when the scheme is missing.",
          ),
        title: z
          .string()
          .optional()
          .describe("Optional title override for the generated analysis."),
        tagsHint: z
          .string()
          .optional()
          .describe("Optional comma-separated hint for generated tags."),
        preferredLanguage: z
          .string()
          .optional()
          .describe(
            "Preferred language for the generated title/summary/tags (e.g. 'en', 'es').",
          ),
        bucketIds: z
          .array(z.string())
          .optional()
          .describe(
            "Bucket ids to assign the website to. Required unless bucketSlugs or bucket is provided.",
          ),
        bucketSlugs: z
          .array(z.string())
          .optional()
          .describe(
            "Bucket slugs to assign the website to. Required unless bucketIds or bucket is provided.",
          ),
        bucket: z
          .string()
          .optional()
          .describe(
            "Convenience single bucket slug. Required unless bucketIds or bucketSlugs is provided.",
          ),
        createMissingBuckets: z
          .boolean()
          .optional()
          .describe("If true, create missing bucket slugs before assignment."),
        idempotencyKey: z
          .string()
          .optional()
          .describe(
            "Optional Idempotency-Key; replays return the existing website.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: {
      url: string;
      title?: string;
      tagsHint?: string;
      preferredLanguage?: string;
      bucketIds?: string[];
      bucketSlugs?: string[];
      bucket?: string;
      createMissingBuckets?: boolean;
      idempotencyKey?: string;
    }) => {
      try {
        await logEvent("info", "Ingesting website into Calypso knowledge.", {
          tool: CALYPSO_ADD_WEBSITE,
          url: input.url,
          bucketCount:
            (input.bucketIds?.length || 0) +
            (input.bucketSlugs?.length || 0) +
            (input.bucket ? 1 : 0),
        });
        const website = await addKnowledgeWebsite(config, input);
        await logEvent("notice", "Calypso website knowledge created.", {
          tool: CALYPSO_ADD_WEBSITE,
          knowledgeId: website.knowledge_id || null,
          status: website.ingestion_status || null,
        });
        return {
          content: [{ type: "text" as const, text: formatJson(website) }],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_ADD_WEBSITE}:`, error);
        await logEvent("error", "Calypso website ingestion failed.", {
          tool: CALYPSO_ADD_WEBSITE,
          url: input.url,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to ingest the website into Calypso knowledge. ${error}`,
            },
          ],
        };
      }
    },
  );

  tools.register(
    CALYPSO_UPLOAD_FILE,
    {
      description: [
        "[CALYPSO UPLOAD FILE]",
        "Uploads a file into the durable bucket-backed knowledge store and indexing pipeline.",
        "",
        "Use this when you want a file indexed into the broader knowledge corpus instead of",
        "attached directly to a single RAG chat turn. This tool returns file and task metadata.",
        "A bucket destination is required: pass bucketIds, bucketSlugs, or bucket.",
        "Choose exactly one file source. Use `filePath` when this MCP server runs locally and can read the path, including Claude Desktop or Cursor configs that launch this package with npx. Use `contentBase64` for hosted or remote MCP clients, browser uploads, generated in-memory content, or remote sandbox files that this MCP process cannot read. Use `sourceUrl` for a public http(s) file URL — the Calypso backend fetches it directly (public hosts only, 25MB cap), so the bytes never pass through this MCP process; filename and content type are derived from the remote response. Do not base64-encode local files just to use this tool.",
      ].join("\n"),
      inputSchema: {
        filename: z
          .string()
          .optional()
          .describe(
            "Display filename for the uploaded knowledge file. Required for filePath and contentBase64 sources; derived server-side for sourceUrl.",
          ),
        mimeType: z
          .string()
          .optional()
          .describe(
            "Content type for the uploaded knowledge file. Required for filePath and contentBase64 sources; derived server-side for sourceUrl.",
          ),
        sourceUrl: z
          .string()
          .optional()
          .describe(
            "Public http(s) URL of a file to import. The backend fetches it behind its SSRF policy (public hosts only, 25MB cap) and queues indexing. Typed errors: url_fetch_blocked, url_fetch_failed (retryable), file_too_large.",
          ),
        filePath: z
          .string()
          .optional()
          .describe(
            "Preferred for local MCP installs, including Claude Desktop and Cursor configs that run this package with a local command such as npx. Absolute or relative path readable by the machine running this MCP server. The server reads raw bytes and uploads them through the Calypso upload-session URL; no user-side base64 conversion is needed.",
          ),
        contentBase64: z
          .string()
          .optional()
          .describe(
            "Inline file bytes as base64. Use when filePath is not possible, such as hosted or remote MCP servers, browser-provided files, generated content, or remote sandbox attachment paths that the MCP process cannot read.",
          ),
        title: z
          .string()
          .optional()
          .describe(
            "Optional human-readable title stored with the knowledge file.",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tags for knowledge-store organization."),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe(
            "Optional metadata object serialized onto the upload request.",
          ),
        bucketIds: z
          .array(z.string())
          .optional()
          .describe(
            "Existing knowledge bucket ids to assign this upload to. Required unless bucketSlugs or bucket is provided.",
          ),
        bucketSlugs: z
          .array(z.string())
          .optional()
          .describe(
            "Knowledge bucket slugs to assign this upload to. Required unless bucketIds or bucket is provided.",
          ),
        bucket: z
          .string()
          .optional()
          .describe(
            "Convenience single bucket slug for this upload. Required unless bucketIds or bucketSlugs is provided.",
          ),
        createMissingBuckets: z
          .boolean()
          .optional()
          .describe("If true, create missing bucket slugs before assignment."),
        idempotencyKey: z
          .string()
          .optional()
          .describe("Optional idempotency key for durable upload retries."),
        waitForIndexing: z
          .boolean()
          .optional()
          .describe(
            "If true, wait until indexing reaches a terminal ready state before returning.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      filename,
      mimeType,
      contentBase64,
      filePath,
      sourceUrl,
      title,
      tags,
      metadata,
      bucketIds,
      bucketSlugs,
      bucket,
      createMissingBuckets,
      idempotencyKey,
      waitForIndexing,
    }: UploadKnowledgeFileToolParams) => {
      try {
        requireKnowledgeBucketDestination(
          { bucketIds, bucketSlugs, bucket },
          CALYPSO_UPLOAD_FILE,
        );
        await logEvent("info", "Uploading file to Calypso knowledge store.", {
          tool: CALYPSO_UPLOAD_FILE,
          filename,
          mimeType,
          source: sourceUrl
            ? "sourceUrl"
            : contentBase64
              ? "contentBase64"
              : "filePath",
          tagCount: tags?.length || 0,
          hasMetadata: Boolean(metadata && Object.keys(metadata).length > 0),
          bucketCount:
            (bucketIds?.length || 0) +
            (bucketSlugs?.length || 0) +
            (bucket ? 1 : 0),
          waitForIndexing: waitForIndexing === true,
        });

        const result = await uploadKnowledgeFile(config, {
          filename,
          mimeType,
          contentBase64,
          filePath,
          sourceUrl,
          title,
          tags,
          metadata,
          bucketIds,
          bucketSlugs,
          bucket,
          createMissingBuckets,
          idempotencyKey,
          waitForIndexing,
        });

        await logEvent("info", "Calypso knowledge-store upload completed.", {
          tool: CALYPSO_UPLOAD_FILE,
          fileId: result.file.id,
          taskId: result.task?.id || null,
          status: result.file.status || result.task?.status || null,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatJson(result),
            },
          ],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_UPLOAD_FILE}:`, error);
        await logEvent("error", "Calypso knowledge-store upload failed.", {
          tool: CALYPSO_UPLOAD_FILE,
          filename,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to upload file into the knowledge store. ${error}`,
            },
          ],
        };
      }
    },
  );

  tools.register(
    CALYPSO_UPLOAD_FILES_BATCH,
    {
      description: [
        "[CALYPSO UPLOAD FILES BATCH]",
        "Uploads 1 to 100 files into the durable knowledge store and indexing queue in one request.",
        "",
        "Use this for bulk corpus ingestion. Shared bucket fields apply to every item unless an item",
        "provides its own bucket fields. The tool returns batch-level status and, when requested,",
        "polls until the batch reaches active, partially_active, partially_failed, failed, or timeout.",
        "A shared bucket destination is required unless every item provides its own bucket destination.",
        "Choose exactly one file source per item. Use `filePath` when this MCP server runs locally and can read each path, including Claude Desktop or Cursor configs that launch this package with npx. Use `contentBase64` for hosted or remote MCP clients, browser uploads, generated in-memory content, or remote sandbox files that this MCP process cannot read. Do not base64-encode local files just to use this tool.",
      ].join("\n"),
      inputSchema: {
        items: z
          .array(
            z.object({
              filename: z
                .string()
                .describe("Display filename for this knowledge file."),
              mimeType: z
                .string()
                .describe("Content type for this knowledge file."),
              filePath: z
                .string()
                .optional()
                .describe(
                  "Preferred for local MCP installs, including Claude Desktop and Cursor configs that run this package with a local command such as npx. Absolute or relative path readable by the machine running this MCP server. The server reads raw bytes and uploads them through the Calypso upload-session URL; no user-side base64 conversion is needed.",
                ),
              contentBase64: z
                .string()
                .optional()
                .describe(
                  "Inline file bytes as base64. Use when filePath is not possible, such as hosted or remote MCP servers, browser-provided files, generated content, or remote sandbox attachment paths that the MCP process cannot read.",
                ),
              clientFileId: z
                .string()
                .optional()
                .describe(
                  "Optional Firestore-safe id for this batch item. Omit to generate one from filename and item position.",
                ),
              title: z
                .string()
                .optional()
                .describe("Optional human-readable title for this item."),
              tags: z
                .array(z.string())
                .optional()
                .describe("Optional tags for this item."),
              metadata: z
                .record(z.unknown())
                .optional()
                .describe("Optional metadata for this item."),
              bucketIds: z
                .array(z.string())
                .optional()
                .describe(
                  "Existing bucket ids for this item. Required when no shared bucket destination is provided.",
                ),
              bucketSlugs: z
                .array(z.string())
                .optional()
                .describe(
                  "Bucket slugs for this item. Required when no shared bucket destination is provided.",
                ),
              bucket: z
                .string()
                .optional()
                .describe(
                  "Convenience single bucket slug for this item. Required when no shared bucket destination is provided.",
                ),
              createMissingBuckets: z
                .boolean()
                .optional()
                .describe(
                  "If true, create missing bucket slugs for this item before assignment.",
                ),
            }),
          )
          .min(1)
          .max(100)
          .describe("Knowledge files to upload in this batch."),
        batchIdempotencyKey: z
          .string()
          .optional()
          .describe(
            "Idempotency key used to derive the durable batch id. " +
              "Auto-generated when omitted; pass your own stable key to make " +
              "a retried call replay the same batch instead of creating a new one.",
          ),
        bucketIds: z
          .array(z.string())
          .optional()
          .describe(
            "Existing bucket ids applied to all items by default. Required unless every item has a bucket destination.",
          ),
        bucketSlugs: z
          .array(z.string())
          .optional()
          .describe(
            "Bucket slugs applied to all items by default. Required unless every item has a bucket destination.",
          ),
        bucket: z
          .string()
          .optional()
          .describe(
            "Convenience single bucket slug applied to all items by default. Required unless every item has a bucket destination.",
          ),
        createMissingBuckets: z
          .boolean()
          .optional()
          .describe(
            "If true, create missing shared bucket slugs before assignment.",
          ),
        waitForBatchReady: z
          .boolean()
          .optional()
          .describe(
            "If true, poll batch status with include_items=true until terminal or timeout.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      items,
      batchIdempotencyKey,
      bucketIds,
      bucketSlugs,
      bucket,
      createMissingBuckets,
      waitForBatchReady,
    }: UploadKnowledgeFilesBatchToolParams) => {
      try {
        // LLM callers rarely have a natural idempotency key at hand; generate
        // one when omitted. Callers that want retry-replay semantics across
        // separate tool calls supply their own stable key.
        const resolvedBatchKey =
          (batchIdempotencyKey || "").trim() || `mcp-batch-${randomUUID()}`;
        requireBatchBucketDestinations({
          items,
          batchIdempotencyKey: resolvedBatchKey,
          bucketIds,
          bucketSlugs,
          bucket,
          createMissingBuckets,
          waitForBatchReady,
        });
        await logEvent("info", "Uploading knowledge file batch to Calypso.", {
          tool: CALYPSO_UPLOAD_FILES_BATCH,
          itemCount: items.length,
          sharedBucketCount:
            (bucketIds?.length || 0) +
            (bucketSlugs?.length || 0) +
            (bucket ? 1 : 0),
          waitForBatchReady: waitForBatchReady === true,
        });

        const result = await uploadKnowledgeFilesBatch(config, {
          items,
          batchIdempotencyKey: resolvedBatchKey,
          bucketIds,
          bucketSlugs,
          bucket,
          createMissingBuckets,
          waitForBatchReady,
        });

        await logEvent("info", "Calypso knowledge batch upload completed.", {
          tool: CALYPSO_UPLOAD_FILES_BATCH,
          batchId: result.id,
          status: result.status || null,
          accepted: result.accepted ?? null,
          rejected: result.rejected ?? null,
          itemCount: result.items?.length || items.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatJson(result),
            },
          ],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_UPLOAD_FILES_BATCH}:`, error);
        await logEvent("error", "Calypso knowledge batch upload failed.", {
          tool: CALYPSO_UPLOAD_FILES_BATCH,
          itemCount: items?.length || 0,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to upload the file batch. ${error}`,
            },
          ],
        };
      }
    },
  );

  tools.register(
    CALYPSO_AGENT,
    {
      description: [
        "[CALYPSO RAG AGENT]",
        "Sends each prompt directly to the Calypso agent using the full conversation context.",
        "",
        "Use this when you want Calypso knowledge retrieval and grounded answers from the RAG backend.",
        "Typical requests:",
        '- "Summarize the key points from our onboarding documentation"',
        '- "What does the knowledge base say about campaign approval rules?"',
        '- "Compare the documented indexing flow with the retrieval flow"',
        '- "Answer using the uploaded file ids: [\\"file_123\\"]"',
        "",
        "Responses API behavior:",
        "- First turns start a named Calypso conversation via `/v1/responses`.",
        "- Follow-up turns chain with `previous_response_id` so the backend owns conversation state.",
        "- When `fileIds` are provided, the MCP uses `rag_policy` retrieval semantics instead of inline attachment stuffing.",
        "",
        "MCP session behavior:",
        "- This tool maintains a stable conversation id in the background for multi-turn retrieval context.",
        "- Use `/new` to start a fresh conversation and clear the current context window.",
        "",
        "Quick commands (examples):",
        '- "Summarize the latest indexed knowledge about WhatsApp templates"',
        '- "Find the source of truth for campaign approval behavior"',
        '- "Start a new topic" (or use `/new`)',
        "",
        "The authoritative, refreshable variant list lives in the `calypso://rag-agent-models` resource — do not cache this description.",
      ].join("\n"),
      inputSchema: {
        prompt: z
          .string()
          .describe(
            "Your request. Include context, constraints, and desired output.",
          ),
        fileIds: z
          .array(z.string())
          .optional()
          .describe(
            "Optional uploaded agent-store `file_id` values to attach with `rag_policy` retrieval semantics.",
          ),
        model: z
          .string()
          .optional()
          .describe(
            `Optional Calypso agent model variant. Defaults to \`${currentCatalog.defaultModel}\`. Read the calypso://rag-agent-models resource for the current list.`,
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ prompt, fileIds, model }: RagPromptParams) => {
      try {
        const userText = (prompt || "").trim();
        const normalizedFileIds = normalizeFileIds(fileIds);
        const selectedModel = resolveRagModelId(model);
        const conversationState = getConversationState(selectedModel);
        if (userText === "/new") {
          if (String(model || "").trim()) {
            const resetState = resetConversationState(selectedModel);
            await logEvent("notice", "Calypso RAG conversation reset.", {
              tool: CALYPSO_AGENT,
              model: selectedModel,
              conversationId: resetState.conversationId,
            });
          } else {
            conversationStates.clear();
            await logEvent("notice", "Calypso RAG conversations reset.", {
              tool: CALYPSO_AGENT,
              models: modelIdsFromCatalog(currentCatalog),
            });
          }
          return {
            content: [
              {
                type: "text" as const,
                text: "Started a new Calypso RAG conversation. You can continue with your next request.",
              },
            ],
          };
        }

        await logEvent("info", "Calling Calypso agent.", {
          tool: CALYPSO_AGENT,
          model: selectedModel,
          conversationId: conversationState.conversationId,
          fileCount: normalizedFileIds?.length || 0,
          continuesPreviousResponse: Boolean(
            conversationState.previousResponseId,
          ),
        });

        const request: CalypsoResponsesRequest = {
          model: selectedModel,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: userText,
                },
                ...(normalizedFileIds || []).map((fileId) => ({
                  type: "input_file" as const,
                  file_id: fileId,
                })),
              ],
            },
          ],
          stream: true,
          store: true,
          metadata: buildResponsesMetadata({
            conversationId: conversationState.conversationId,
            fileIds: normalizedFileIds,
            modelId: selectedModel,
          }),
        };

        if (conversationState.previousResponseId) {
          request.previous_response_id = conversationState.previousResponseId;
        } else {
          request.conversation = { id: conversationState.conversationId };
        }

        // Calypso/AIcore accepts Responses fields that this SDK version does not
        // type yet (`conversation` and `previous_response_id`), so we narrow the
        // cast to the API boundary.
        const response = await getCalypsoClient().responses.create(
          request as unknown as ResponseCreateParamsStreaming,
        );
        const result = await processStreamingResponse(response);
        if (result.responseId) {
          conversationStates.set(selectedModel, {
            conversationId: conversationState.conversationId,
            previousResponseId: result.responseId,
          });
        }

        await logEvent("info", "Calypso agent response completed.", {
          tool: CALYPSO_AGENT,
          model: selectedModel,
          conversationId: conversationState.conversationId,
          responseId: result.responseId,
          textLength: result.text.length,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: result.text,
            },
          ],
        };
      } catch (error) {
        console.error(`Error calling ${CALYPSO_AGENT}:`, error);
        await logEvent("error", "Calypso agent call failed.", {
          tool: CALYPSO_AGENT,
          model: String(model || "").trim() || modelCatalog.defaultModel,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to process ${CALYPSO_AGENT} query. ${error}`,
            },
          ],
        };
      }
    },
  );

  return server;
}
