---
name: find-a-bucket
description: List the team's Calypso buckets with elephant-list-buckets to see what Elephant knows, find a bucket's id or slug, or count its sources. Use before searching a specific bucket.
---

# Find a bucket

A bucket is a folder of sources Elephant remembers: files and websites the team grouped together in Calypso, such as "Product docs" or "HR policies". Use `elephant-list-buckets` to see them.

## When to use it

- The user asks what Elephant knows, or which buckets exist.
- The user names a bucket ("search only HR policies") and you need its id or slug for `elephant-search`.
- You need a source's id to look it up with `elephant-open-source`. Each bucket lists its sources by id and name, so find the id by the name the user gave. Tell the user the name, not the id.

## How to call it

- No arguments lists the team's active buckets.
- `includeArchived: true` adds archived buckets. Use it only when the user asks about archived or old buckets.

Each bucket comes back with its `id`, `name`, `slug`, member counts, whether its store is ready, and the ids of the sources it holds.

## How to answer

- List buckets by name, with how many sources each holds. Show ids or slugs only when the user needs them.
- Cite the bucket list as the source of what you report ("according to Elephant's bucket list").
- Match the user's wording to a bucket name loosely ("HR" can mean "HR policies"); if two buckets could match, ask which one.
- If a bucket is not ready yet, say its sources may still be indexing.

## What Elephant does not do

- It does not create, rename or archive buckets. Create one with `elephant-create-bucket` and rename one with `elephant-rename-bucket`; archiving happens in the Elephant console.
- It does not show the content of a bucket's sources; search them with `elephant-search`.
