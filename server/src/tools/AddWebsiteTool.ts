import { z } from "zod";

import { countBucketTargets } from "../calypso/BucketDestination.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import { bucketDestinationInputs, idempotencyKeyInput } from "./schemaParts.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  url: z
    .string()
    .min(1)
    .describe("The web page to add. https:// is assumed when left out."),
  title: z
    .string()
    .optional()
    .describe("Optional title to use instead of the one Calypso writes."),
  tagsHint: z
    .string()
    .optional()
    .describe("Optional comma-separated hint for the tags Calypso writes."),
  preferredLanguage: z
    .string()
    .optional()
    .describe(
      "Language for the title, summary and tags Calypso writes, e.g. 'en' or 'es'.",
    ),
  ...bucketDestinationInputs,
  idempotencyKey: idempotencyKeyInput,
};

/** `elephant-add-website`: a web page into a bucket. */
export class AddWebsiteTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-add-website";
  readonly title = "Add a website";
  readonly description = [
    "Adds a web page to knowledge buckets so Elephant can answer from it. Calypso reads the page and writes its title, summary and tags.",
    "",
    "Use it when the user shares a link and wants Elephant to remember it.",
    "Adding a page the team already has is refused as `website_url_exists`, unless the same `idempotencyKey` is sent again.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  protected readonly failure = "Adding the website failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    await log.event("info", "Adding a website to knowledge.", {
      tool: this.name,
      bucketCount: countBucketTargets(args),
    });
    const website = await api.websites.add(args);
    await log.event("info", "Website added to knowledge.", {
      tool: this.name,
      knowledgeId: website.knowledge_id ?? null,
      status: website.ingestion_status ?? null,
    });
    return { json: website };
  }
}
