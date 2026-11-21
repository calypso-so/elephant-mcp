---
name: organise-buckets
description: Rename a bucket with elephant-rename-bucket or move sources between buckets with elephant-move-sources. Use when the user wants to tidy their knowledge, refile a file or split a bucket. Nothing is deleted.
---

# Organise buckets

Buckets are the folders Elephant keeps sources in. Two tools reorganise what is already saved. Neither adds, deletes or re-uploads anything.

## When to use it

- The user wants a bucket called something else, or wants to note what it holds: `elephant-rename-bucket`.
- The user wants a source filed somewhere else, or wants to split one bucket into two: `elephant-move-sources`.

## Before you change anything

1. Call `elephant-list-buckets`. It names every bucket and the sources in it, with their ids.
2. Match what the user said to a real bucket and real sources. If a name is ambiguous, ask which one.
3. Say what you are about to do in the user's words: the sources by name, the bucket they leave, the bucket they go to. Then do it.

## How to call it

Rename:

- `bucket` (required): the bucket's id or slug.
- `name` and `description`: pass at least one. The slug and the sources stay as they are.

Move:

- `sourceIds` (required): ids of the sources to move, up to 100.
- `fromBucket` and `toBucket` (required): ids or slugs. The destination must exist; create it first with `elephant-create-bucket` when it does not.

## Report what happened

Cite the tool's own result: the bucket's name as returned after a rename, and for a move each source by name with the status the tool gave it.

A move returns one line per source. Read every line and tell the user, by source name:

- `moved`: it is now in the new bucket only.
- `not_in_source_bucket`: it was never in the bucket you named. Check the bucket list and try again.
- `added_not_removed`: it is now in both buckets. Say so; do not call it moved.
- `not_found` or `not_added`: nothing changed for that source.

A moved source is answerable from its new bucket once indexing there finishes, usually within a minute.

## What Elephant does not do

- It does not delete sources or buckets, and it does not archive a bucket. Do that in the Elephant console.
- It does not merge two files into one or change a file's content.
- If these tools are not available in this chat, the user connected Elephant without allowing it to organise. They reconnect Elephant and allow it.
