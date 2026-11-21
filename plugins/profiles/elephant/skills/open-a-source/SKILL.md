---
name: open-a-source
description: Look up one source in the team's Calypso knowledge with elephant-open-source to report its file name, type, size, indexing status and buckets. Use when the user asks about a specific source or why it is missing from answers.
---

# Open a source

Use `elephant-open-source` to look up one source by its id: what it is and whether Elephant has finished indexing it.

## Where the id comes from

- `elephant-search` results carry a `file_id` for each passage from a file.
- `elephant-list-buckets` lists the sources in each bucket by id and name.

If the user names a source by title, find it by name in `elephant-list-buckets` and open its id. Fall back to `elephant-search` only when the bucket list does not name it.

## How to call it

- `fileId` (required): the source id.
- `verify` (optional): `true` asks the index for its current state of the source. It is slower; use it only when the status looks stale or the user says a source is missing from answers.

The result gives the file name, type, size, indexing status and its sync state in each bucket.

## How to answer

- Report the file name, type and size in plain words, and whether it is indexed ("ready"), still indexing, or failed.
- Cite the source by file name when you report its details.
- A source that is still indexing will not appear in answers yet; say so, and suggest asking again later.
- A failed source needs to be added again: save it again with `elephant-add-file` or `elephant-add-website`.
- This tool reports details, not the text of the source. To read what a source says, search it with `elephant-search` and cite the passages.

## What Elephant does not do

- It does not download, edit or delete sources.
- It does not re-run indexing. Re-add the source with `elephant-add-file` or `elephant-add-website`.
