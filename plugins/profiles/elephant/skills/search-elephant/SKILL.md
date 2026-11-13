---
name: search-elephant
description: Find the raw passages and sources in the team's Calypso knowledge with elephant-search, without a written answer. Use when the user wants evidence, quotes, or to see where something is mentioned.
---

# Search Elephant

Use `elephant-search` when the user wants the evidence itself: "where do we mention X", "find the passage about Y", "show me the sources on Z". It returns passages and their sources, not a written answer.

## How to call it

- `query` (required): what to look for, in the user's words.
- `buckets` (optional): up to 5 bucket ids or slugs to search, when the user names buckets ("only in Product docs"). Find them with `elephant-list-buckets`.
- `agent` (optional): a specific Elephant agent variant whose sources to search, only when the user names one. Do not pass `agent` and `buckets` together.
- `maxResults` (optional): 1 to 20, default 10. Raise it when the user wants everything that matches.

## Reading the result

Each result carries a `source_index`, the passage `text`, a `title`, and where it came from: `filename` and `file_id` for files, `url` for websites. Results are ordered by relevance.

## Cite every passage

- Present each passage with its source: the file name, or the URL for a website. Number them so the user can refer back ("[1] Shipping policy.pdf").
- Quote passages as returned. Do not merge passages from different sources into one quote.
- If you summarise across passages, cite each point with the passage it came from.
- If nothing matches, say so and follow the `elephant-doesnt-know` skill. Do not fill the gap from general knowledge.
- To show a source's details or indexing status, pass its `file_id` to `elephant-open-source`.

## What Elephant does not do

- It does not search the open web. Only sources the team added to Calypso are searched.
- It does not add sources. Adding files and websites is Elephant Builder by Calypso.
