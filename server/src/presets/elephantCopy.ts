import type { PublicToolSpec } from "./PublicToolSpec.js";

/**
 * Elephant by Calypso — public tool copy.
 *
 * Kept apart from the canonical descriptions in server.ts on purpose: these
 * strings are what ChatGPT reviewers and users read, so they name only
 * Elephant tools and never mention local files, npx, or Calypso tool ids.
 */

export const ELEPHANT_ASK: PublicToolSpec = {
  name: "elephant-ask",
  title: "Ask Elephant",
  description: [
    "Answers a question from the team's Calypso knowledge (documents, websites, images and other sources the team has added), with citations.",
    "",
    "Use it when the user asks about their own company, product, policies, documents or anything their team keeps in Calypso.",
    "Always cite the sources the answer returns. If the answer says the knowledge does not cover the question, say so plainly instead of answering from general knowledge.",
    "Each call stands alone: put everything needed to answer, including the subject of a follow-up, in the prompt.",
    "Optional `model` picks one of the team's Calypso agents; omit it to use the default.",
  ].join("\n"),
  inputDescriptions: {
    prompt: "The user's question, with any context or format they asked for.",
    fileIds:
      "Optional file ids (from elephant-list-buckets) to focus the answer on specific sources.",
    model:
      "Optional id of one of the team's Calypso agents. Omit to use the team's default agent.",
  },
};

export const ELEPHANT_SEARCH: PublicToolSpec = {
  name: "elephant-search",
  title: "Search Elephant",
  description: [
    "Searches the team's Calypso knowledge and returns the matching passages and their sources, without writing an answer.",
    "",
    "Use it when the user wants the exact wording, quotes, or a list of where something is mentioned.",
    "Pass `buckets` (ids or slugs from elephant-list-buckets, up to 5) to search specific buckets, or `agent` to search what one Calypso agent can see — not both.",
  ].join("\n"),
  inputDescriptions: {
    agent:
      "Optional id of one of the team's Calypso agents, to search only what that agent can see. Not together with buckets.",
    buckets:
      "Bucket ids or slugs (from elephant-list-buckets) to search directly, up to 5. Not together with agent.",
  },
};

export const ELEPHANT_LIST_BUCKETS: PublicToolSpec = {
  name: "elephant-list-buckets",
  title: "List buckets",
  description: [
    "Lists the team's knowledge buckets — folders of sources Elephant remembers — with their names, slugs, file counts and file ids.",
    "",
    "Use it to show the user what Elephant knows about, or to pick buckets before elephant-search.",
  ].join("\n"),
};

export const ELEPHANT_OPEN_SOURCE: PublicToolSpec = {
  name: "elephant-open-source",
  title: "Open a source",
  description: [
    "Returns one source's details by file id: name, type, size and whether it is ready to answer from.",
    "",
    "Use it when the user asks about a specific source cited in an answer or listed by elephant-list-buckets.",
  ].join("\n"),
  inputDescriptions: {
    fileId: "The source's file id, as listed by elephant-list-buckets.",
    verify:
      "If true, double-check the source's indexing status with the index itself. Slower.",
  },
};

export const ELEPHANT_ADD_FILE: PublicToolSpec = {
  name: "elephant-add-file",
  title: "Add a file",
  description: [
    "Adds one file to a knowledge bucket so Elephant can answer from it.",
    "",
    "Pass the file as `sourceUrl` (a public http(s) link) or `contentBase64`, plus a bucket (`bucket`, `bucketSlugs` or `bucketIds`).",
    "Pass `waitForIndexing: true` when the user wants to ask about the file right away.",
  ].join("\n"),
  inputDescriptions: {
    filename:
      "File name to show for this source. Required with contentBase64; taken from the link with sourceUrl.",
    mimeType:
      "Content type of the file. Required with contentBase64; taken from the link with sourceUrl.",
    contentBase64:
      "The file's bytes as base64. Use when the file is not at a public link.",
  },
};

export const ELEPHANT_ADD_FILES: PublicToolSpec = {
  name: "elephant-add-files",
  title: "Add several files",
  description: [
    "Adds 1 to 100 files to knowledge buckets in one request.",
    "",
    "Each item carries its bytes as `contentBase64`. A shared bucket applies to every item unless an item names its own.",
  ].join("\n"),
  inputDescriptions: {
    "items.contentBase64": "The file's bytes as base64.",
  },
};

export const ELEPHANT_ADD_WEBSITE: PublicToolSpec = {
  name: "elephant-add-website",
  title: "Add a website",
  description: [
    "Adds a web page to knowledge buckets so Elephant can answer from it. Calypso reads the page and writes its title, summary and tags.",
    "",
    "Use it when the user shares a link and wants Elephant to remember it.",
  ].join("\n"),
};

export const ELEPHANT_CREATE_BUCKET: PublicToolSpec = {
  name: "elephant-create-bucket",
  title: "Create a bucket",
  description: [
    "Creates a new knowledge bucket (a folder of sources) for the team.",
    "",
    "Use it when the user wants to keep a new topic separate before adding files or websites.",
  ].join("\n"),
};

export const ELEPHANT_INSTRUCTIONS = [
  "Elephant by Calypso answers from this team's Calypso knowledge — the documents, websites and images the team has added — and cites every source.",
  "It is read-only: it cannot add, change or delete knowledge. To add files or websites, use Elephant Builder by Calypso.",
  "When the knowledge does not cover a question, say so instead of answering from general knowledge.",
].join(" ");

export const ELEPHANT_BUILDER_INSTRUCTIONS = [
  "Elephant Builder by Calypso adds files and websites to this team's Calypso knowledge buckets and creates new buckets.",
  "It does not answer questions; use Elephant by Calypso to ask about the knowledge once it is added.",
  "Confirm the destination bucket with the user before adding content.",
].join(" ");
