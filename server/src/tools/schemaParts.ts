import { z } from "zod";

/**
 * Input fields several write tools share, worded once.
 *
 * Every add and create tool names a destination the same way, so the model
 * learns one convention instead of four.
 */
export const bucketDestinationInputs = {
  bucketIds: z
    .array(z.string())
    .optional()
    .describe(
      "Ids of existing buckets to add to (from elephant-list-buckets). Give this, bucketSlugs or bucket.",
    ),
  bucketSlugs: z
    .array(z.string())
    .optional()
    .describe(
      "Slugs of buckets to add to (from elephant-list-buckets). Give this, bucketIds or bucket.",
    ),
  bucket: z
    .string()
    .optional()
    .describe("One bucket slug, as a shortcut for a single destination."),
  createMissingBuckets: z
    .boolean()
    .optional()
    .describe(
      "If true, buckets named by slug that do not exist yet are created.",
    ),
};

export const idempotencyKeyInput = z
  .string()
  .optional()
  .describe(
    "Optional key that makes a retry return the first result instead of adding the same thing twice.",
  );

/**
 * A file the user attached in ChatGPT, as ChatGPT passes it.
 *
 * OpenAI's Apps SDK requires all four properties to be declared, with
 * `download_url` and `file_id` required; ChatGPT sends the rest when it has
 * them.
 */
export const chatGptFileInput = z
  .object({
    download_url: z
      .string()
      .describe("Temporary link ChatGPT provides to fetch the file."),
    file_id: z.string().describe("ChatGPT's id for the file."),
    mime_type: z.string().optional().describe("The file's content type."),
    file_name: z.string().optional().describe("The file's name."),
  })
  .describe("A file the user attached in ChatGPT.");

export type ChatGptFile = z.infer<typeof chatGptFileInput>;
