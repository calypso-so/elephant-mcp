---
name: ask-elephant
description: Answer a question from the team's Calypso knowledge with elephant-ask, citing the source of every claim. Use for questions about the team's own policies, products, processes and documents.
---

# Ask Elephant

Use `elephant-ask` when the user wants an answer drawn from their team's own knowledge: a policy, a product detail, a process, something in a document or on a website the team added to Calypso.

## How to call it

- `prompt` (required): the user's question in full, with any constraints ("in two sentences", "as a table", "only from the 2026 price list").
- `fileIds` (optional): ids of sources the answer must take into account, when the user points at specific sources you found with `elephant-list-buckets` or `elephant-search`. The answer may still use other sources. If the call fails because an id is unknown, ask again without `fileIds`.
- `model` (optional): a specific Elephant agent variant, only when the user names one. Leave it empty: Elephant then answers from every bucket the user has, including one created a moment ago.
- `buckets` (optional): up to 5 bucket ids or slugs, when the user names a folder or topic that matches a bucket ("from my Chess notes"). Leave it empty otherwise; Elephant finds the buckets with evidence itself.
- `depth` (optional): how much work the answer gets. Leave it empty for the agent's own default.

## When the reply is not an answer

- A reply that ends "Searched 5 of N buckets … Not searched: …" read the buckets with the strongest match. If the user expects the answer in one it did not search, ask again with that bucket in `buckets`.
- A tool error that names `model`, `fileIds` or `buckets` says exactly what to change. Do it and ask once more; do not tell the user the knowledge is missing.
- A newly saved file answers once it finishes indexing, usually within a minute. If the reply says sources are still indexing, wait and ask again.

## Choosing a depth

Pick the depth from the question, not from habit. Deeper is slower, and a simple question gets no better answer from it.

| Depth | Use it for | Roughly |
|---|---|---|
| `fast` | One stated fact: a price, a date, a limit, a name | a few seconds |
| `balanced` | An explanation or summary drawn from a few passages | about 20 seconds |
| `deep` | Comparing or reconciling several sources, or an answer the user will act on | the slowest |

- Start at the lowest depth that fits.
- Every reply ends with "Answered at depth: …". Read it before deciding what to do next. When the user asks for a depth, pass it as `depth`; do not switch to `elephant-search` to get a faster answer.
- If the answer is thin, misses part of the question, or says the sources do not cover something the user expects to be there, ask once more **one depth higher**. Never repeat a call at the same depth.
- If the reply says it was answered at a lower depth than you asked for, the team's plan caps depth there. Do not retry higher; work with that answer.
- Only after `deep` (or the plan's cap) comes back empty, follow the `elephant-doesnt-know` skill.

Each call stands alone: Elephant does not remember earlier questions. For a follow-up ("and what does it cover?"), write the full question into `prompt` ("What does the warranty cover?") so it can be answered without the earlier turns.

## Cite every claim

- Keep the sources Elephant names in its answer. After each claim, cite the file name, or the URL for a website, that it came from.
- Elephant lists its sources under the answer, each with a file id. If an answer comes back without sources, call `elephant-search` with the same question and cite the passages it returns. If the search finds nothing either, follow the `elephant-doesnt-know` skill.
- Do not add facts from general knowledge to Elephant's answer. If you add context of your own, label it clearly as not coming from the team's sources.
- Quote short passages exactly when wording matters (prices, dates, legal terms).

## Example

User: "What does our refund policy say about digital products?"

1. Call `elephant-ask` with that question.
2. Reply with the answer and a citation after each claim, for example: "Digital products can be refunded within 14 days if unused (Refund policy.pdf)."

## What Elephant does not do

- It does not add, edit or delete sources. To save a file or a web page, use `elephant-add-file` or `elephant-add-website`. Elephant never deletes.
- It does not answer from the open web or general knowledge; it answers from the team's sources only.
- It does not book meetings, send messages or run other Calypso products.
