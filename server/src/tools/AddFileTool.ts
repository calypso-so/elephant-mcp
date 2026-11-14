import { z } from "zod";

import { countBucketTargets } from "../calypso/BucketDestination.js";
import type { UploadKnowledgeFileParams } from "../calypso/KnowledgeFiles.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import {
  bucketDestinationInputs,
  type ChatGptFile,
  chatGptFileInput,
  idempotencyKeyInput,
} from "./schemaParts.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  file: chatGptFileInput
    .optional()
    .describe(
      "A file the user attached in ChatGPT. The preferred source when there is one.",
    ),
  sourceUrl: z
    .string()
    .optional()
    .describe(
      "A public http(s) link to the file. Calypso fetches it itself (public hosts only, up to 25 MB).",
    ),
  contentBase64: z
    .string()
    .optional()
    .describe(
      "The file's bytes as base64. Use only when the file is neither attached nor at a public link.",
    ),
  filename: z
    .string()
    .optional()
    .describe(
      "File name to show for this source. Required with contentBase64; taken from the file otherwise.",
    ),
  mimeType: z
    .string()
    .optional()
    .describe(
      "Content type of the file. Required with contentBase64; taken from the file otherwise.",
    ),
  title: z
    .string()
    .optional()
    .describe("Optional human-readable title for the source."),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags to organise the source."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Optional extra fields stored with the source."),
  ...bucketDestinationInputs,
  idempotencyKey: idempotencyKeyInput,
  waitForIndexing: z
    .boolean()
    .optional()
    .describe(
      "If true, wait until the file is ready to answer from before returning.",
    ),
};

type Args = ToolArgs<typeof inputSchema>;

/** `elephant-add-file`: one file into a bucket, from ChatGPT or a link. */
export class AddFileTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-add-file";
  readonly title = "Add a file";
  readonly description = [
    "Adds one file to a knowledge bucket so Elephant can answer from it.",
    "",
    "Pass exactly one source: `file` (a file the user attached in ChatGPT), `sourceUrl` (a public http(s) link) or `contentBase64`. Also pass a bucket (`bucket`, `bucketSlugs` or `bucketIds`).",
    "Pass `waitForIndexing: true` when the user wants to ask about the file right away.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly fileParams = ["file"] as const;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  protected readonly failure = "Adding the file failed.";

  protected async run(
    args: Args,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    const params = AddFileTool.uploadParams(args);
    await log.event("info", "Adding a file to knowledge.", {
      tool: this.name,
      source: args.file ? "chatgpt" : params.sourceUrl ? "link" : "inline",
      bucketCount: countBucketTargets(params),
      waitForIndexing: params.waitForIndexing === true,
    });
    const result = await api.files.upload(params);
    await log.event("info", "File added to knowledge.", {
      tool: this.name,
      fileId: result.file.id,
      status: result.file.status || result.task?.status || null,
    });
    return { json: result };
  }

  /**
   * A ChatGPT attachment arrives as a temporary download link. It is handed
   * to Calypso as a link to import, so the bytes go from OpenAI to Calypso
   * under Calypso's own fetch policy and never through this server.
   */
  private static uploadParams(args: Args): UploadKnowledgeFileParams {
    const { file, ...rest } = args;
    if (!file) return rest;
    if (rest.sourceUrl?.trim() || rest.contentBase64?.trim()) {
      throw new Error(
        "Pass one source: `file`, `sourceUrl` or `contentBase64`, not several.",
      );
    }
    return {
      ...rest,
      sourceUrl: AddFileTool.downloadUrl(file),
      title: rest.title?.trim() || file.file_name?.trim() || undefined,
    };
  }

  private static downloadUrl(file: ChatGptFile): string {
    const url = file.download_url.trim();
    if (!/^https:\/\//i.test(url)) {
      throw new Error("The attached file has no usable download link.");
    }
    return url;
  }
}
