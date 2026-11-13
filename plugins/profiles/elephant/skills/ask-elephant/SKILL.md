---
name: ask-elephant
description: Answer a question from the team's Calypso knowledge with elephant-ask, citing the source of every claim. Use for questions about the team's own policies, products, processes and documents.
---

# Ask Elephant

Use `elephant-ask` when the user wants an answer drawn from their team's own knowledge: a policy, a product detail, a process, something in a document or on a website the team added to Calypso.

## How to call it

- `prompt` (required): the user's question in full, with any constraints ("in two sentences", "as a table", "only from the 2026 price list").
- `fileIds` (optional): source ids to focus on, when the user points at specific sources you found with `elephant-list-buckets` or `elephant-search`.
- `model` (optional): a specific Elephant agent variant, only when the user names one. Leave it empty to use the team's default.

Each call stands alone: Elephant does not remember earlier questions. For a follow-up ("and what does it cover?"), write the full question into `prompt` ("What does the warranty cover?") so it can be answered without the earlier turns.

## Cite every claim

- Keep the sources Elephant names in its answer. After each claim, cite the file name, or the URL for a website, that it came from.
- If an answer comes back without sources, call `elephant-search` with the same question and cite the passages it returns. If the search finds nothing either, follow the `elephant-doesnt-know` skill.
- Do not add facts from general knowledge to Elephant's answer. If you add context of your own, label it clearly as not coming from the team's sources.
- Quote short passages exactly when wording matters (prices, dates, legal terms).

## Example

User: "What does our refund policy say about digital products?"

1. Call `elephant-ask` with that question.
2. Reply with the answer and a citation after each claim, for example: "Digital products can be refunded within 14 days if unused (Refund policy.pdf)."

## What Elephant does not do

- It does not add, edit or delete sources. Adding files and websites is Elephant Builder by Calypso.
- It does not answer from the open web or general knowledge; it answers from the team's sources only.
- It does not book meetings, send messages or run other Calypso products.
