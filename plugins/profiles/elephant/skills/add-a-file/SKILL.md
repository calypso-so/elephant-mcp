---
name: add-a-file
description: Add files to the team's Calypso knowledge with elephant-add-file (one file) or elephant-add-files (up to 100). Use when the user attaches files in ChatGPT or shares a public file link and wants Elephant to learn it.
---

# Add a file

Use `elephant-add-file` for one file and `elephant-add-files` for several. Each file becomes a source in a bucket, and Elephant can answer from it once indexing finishes.

## Pick the bucket first

Every file needs a destination. Pass one of:

- `bucket`: a single bucket slug, for example `policies`.
- `bucketSlugs` or `bucketIds`: one or more buckets.

If the user did not say which bucket, ask. If the bucket they name may not exist yet, pass `createMissingBuckets: true` so it is created, and tell the user a new bucket was made.

## One file: `elephant-add-file`

Give exactly one file source:

- A file the user attached in ChatGPT: pass it as `file`. ChatGPT supplies the file; Calypso imports it, keeping its name as the title.
- A public link to a file: pass it as `sourceUrl`. Calypso downloads it directly (public hosts only, 25 MB at most) and works out the name and type itself.
- Generated content (for example a summary the user asked you to save): pass it as `contentBase64` with a `filename` and `mimeType`.

Optional: `title` (a readable name), `tags`, `waitForIndexing: true` when the user wants to ask about the file straight away, and `idempotencyKey` so a retry does not add the file twice.

## Several files: `elephant-add-files`

- Put each file in `items` (1 to 100), each with `filename`, `mimeType` and its bytes as `contentBase64`.
- For files the user attached in ChatGPT, call `elephant-add-file` once per file instead: attachments are passed one at a time.
- Shared bucket fields (`bucket`, `bucketSlugs`, `bucketIds`, `createMissingBuckets`) apply to every item unless an item sets its own.
- `waitForBatchReady: true` waits until the batch finishes and reports each item.
- For generated content, prefer one batch over many single calls.

## Report what happened

Cite exactly what the tool returned for each file: the file name, the bucket, and the status (queued, indexing, ready or failed). Say that a file becomes answerable once it is ready.

Errors come back with a code; quote it and explain it:

- `url_fetch_blocked`: the link is not public. Ask the user to attach the file instead.
- `url_fetch_failed`: the download failed for now; retry once.
- `file_too_large`: the file is over 25 MB.

## What Elephant does not do

- It does not replace, edit or delete files. Do that in the Calypso console.
- It does not read files from the user's computer by path; files come from ChatGPT attachments or public links.
