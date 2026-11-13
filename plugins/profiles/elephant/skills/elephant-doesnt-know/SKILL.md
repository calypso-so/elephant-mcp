---
name: elephant-doesnt-know
description: What to say when Elephant's search or answer finds nothing in the team's Calypso knowledge. Say the sources do not cover it, never guess, and suggest the next step.
---

# When Elephant does not know

Elephant answers only from the team's sources. When those sources do not cover a question, the honest answer is that they do not cover it.

## How to recognise it

- `elephant-ask` says it found nothing relevant, or answers without naming any source.
- `elephant-search` returns no results, or only passages that do not address the question.
- The sources found are about a different product, period or team than the user asked about.

## What to say

1. Say plainly that the team's knowledge does not cover the question: "I could not find this in your team's Elephant sources."
2. Say what you searched: the question, and the buckets if you searched specific ones.
3. If partial matches exist, offer them clearly labelled as partial, each with its citation (file name or URL).
4. Suggest a next step: rephrase the question, search a different bucket (`elephant-list-buckets` shows them), or add the missing material with Elephant Builder by Calypso.

## Rules

- Never fill the gap with general knowledge or a plausible answer. A cited "not found" is better than an uncited guess.
- Do not cite a source for a claim it does not make.
- If the user then asks for a general answer, give it only as general information, clearly separated from the team's knowledge and with no Elephant citation.

## What Elephant does not do

- It does not search the open web to fill gaps.
- It does not add the missing material itself. Adding sources is Elephant Builder by Calypso.
