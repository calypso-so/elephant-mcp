---
name: add-a-website
description: Add a public web page to the team's Calypso knowledge with elephant-add-website. Calypso reads the page, writes its title, summary and tags, and files it in a bucket.
---

# Add a website

Use `elephant-add-website` when the user wants Elephant to learn a web page: a help-center article, a pricing page, a policy page.

## How to call it

- `url` (required): the page address. `https://` is assumed if the user leaves it out.
- A bucket: `bucket` (one slug), or `bucketSlugs` / `bucketIds`. Ask if the user did not name one. Add `createMissingBuckets: true` when the bucket should be created.
- Optional: `title` to override the generated title, `tagsHint` (comma-separated ideas for tags), `preferredLanguage` (for example `en` or `es`) for the generated summary, and `idempotencyKey` for safe retries.

Calypso reads the page, writes a title, summary and tags, saves it as knowledge and files it in the bucket, all in one call.

## Report what happened

- Cite the page by its URL and the title Calypso generated, and name the bucket it went into.
- `website_url_exists` means the team already has this page. Say so; nothing new was added.
- If the page needs a login, it cannot be read. Suggest saving it as a PDF and adding it as a file instead.

## What Elephant Builder does not do

- It does not crawl a whole site. Each call adds one page; add pages one by one.
- It does not answer questions about the page. Ask Elephant by Calypso, which cites it once added.
- It does not remove or refresh a page. Do that in the Calypso console.
