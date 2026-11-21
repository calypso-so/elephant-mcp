---
name: search-elephant
description: Find the raw passages and sources in the team's Calypso knowledge with elephant-search, without a written answer. Use when the user wants evidence, quotes, or to see where something is mentioned.
---

# Search Elephant

Use `elephant-search` when the user wants the evidence itself: "where do we mention X", "find the passage about Y", "show me the sources on Z". It returns passages and their sources, not a written answer.

## How to call it

- `query` (required): what to look for, in the user's words.
- `buckets` (optional): up to 5 bucket ids or slugs to search, when the user names buckets ("only in Product docs"). Find them with `elephant-list-buckets`.
- `agent` (optional): a specific Elephant agent variant whose sources to search, only when the user names one. Do not pass `agent` and `buckets` together. With neither, the search covers every bucket the user has.
- `maxResults` (optional): 1 to 20, default 10. It is a ceiling, not a target: a search returns as many passages as it finds.
- `depth` (optional): `fast` (default) runs one search; `thorough` runs several in parallel and merges them.
- `alsoSearchFor` (optional): up to 2 other ways of saying the same thing, searched alongside `query`. Naming any makes the search thorough.

## Getting enough back

Each result is one whole matching passage, and a short document is a single passage. Read all of a result's `text` before deciding anything is missing: one result can hold everything the document says on the subject.

- When the passages returned do not cover what the user expects, that is a reason to search again, not a finding. Say nothing about the knowledge being thin until you have.
- Search again with `depth: "thorough"` and `alsoSearchFor`. Write the extra phrasings as the document would: its own terms, a synonym, or the specific items you expect ("express delivery times", "international shipping days").
- Narrow to `buckets` when you know where the material lives.
- When the user wants the content read and summarised, not quoted, use `elephant-ask`.

## Reading the result

Each result carries a `source_index`, the whole passage as `text`, sometimes a `quote` (the line in the passage that matched most closely), a `title`, and where it came from: `filename` and `file_id` for files, `url` for websites. Results are ordered by relevance.

## Cite every passage

- Present each passage with its source: the file name, or the URL for a website. Number them so the user can refer back ("[1] Shipping policy.pdf").
- Quote passages as returned. Do not merge passages from different sources into one quote.
- If you summarise across passages, cite each point with the passage it came from.
- If nothing matches, say so and follow the `elephant-doesnt-know` skill. Do not fill the gap from general knowledge.
- To show a source's details or indexing status, pass its `file_id` to `elephant-open-source`.

## What Elephant does not do

- It does not search the open web. Only sources the team added to Calypso are searched.
- It does not add sources. To save a file or a web page, use `elephant-add-file` or `elephant-add-website`.
