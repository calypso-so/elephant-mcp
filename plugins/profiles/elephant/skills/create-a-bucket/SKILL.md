---
name: create-a-bucket
description: Create an empty bucket in the team's Calypso knowledge with elephant-create-bucket, to hold files and websites added later. Use when the user wants a new collection such as Sales playbooks.
---

# Create a bucket

A bucket is a folder of sources Elephant remembers. Use `elephant-create-bucket` when the user wants a new, empty one to fill later.

## How to call it

- `name` (required): the readable name, up to 120 characters, for example "Sales playbooks".
- `slug` (optional): a short id such as `sales-playbooks`. Calypso normalises it; leave it out to derive one from the name.
- `description` (optional): one line on what belongs in the bucket.
- `idempotencyKey` (optional): makes a retry return the same bucket instead of failing.

You do not need this tool just to add a file: additions accept `createMissingBuckets: true` and create the bucket on the way.

## Report what happened

- Cite the result: the bucket's name, slug and id as returned.
- `bucket_slug_exists` means a bucket with that slug already exists. Say so and offer to add sources to the existing bucket instead, or to pick another name.

## What Elephant does not do

- It does not archive or delete buckets. Do that in the Elephant console. To rename one, use `elephant-rename-bucket`.
