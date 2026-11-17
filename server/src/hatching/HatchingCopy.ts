import type { KnowledgeInventorySummary } from "../calypso/KnowledgeInventory.js";

/** Where a person adds sources; the one link the hatch ever shows. */
export const KNOWLEDGE_URL = "https://elephant.calypso.so/buckets";

/*
 * The words Elephant uses in a team's first minute: the session instructions
 * the model reads once, the `elephant-get-started` card, and the answer an
 * empty team gets instead of an apology. One module, so the three never
 * drift. Pure: strings from the inventory's numbers.
 *
 * Rules: one screen, three steps, one link; say what the team HAS, not what
 * the product does; fade by itself — empty → hatch, first ready source →
 * tour; told once per session, never per message.
 */

/** `initialize.instructions`: the preset's text, or the empty-team variant. */
export function hatchingInstructions(
  base: string,
  summary: KnowledgeInventorySummary | null,
): string {
  if (summary === null) return base;
  if (summary.isEmpty) {
    return [
      "Elephant is connected to this team's Calypso knowledge — and the team has nothing in it yet.",
      "The first time the user speaks to you in this session, greet them briefly as Elephant and offer the three steps from the elephant-get-started prompt.",
      "Do not answer questions from general knowledge; say the knowledge is empty and point to adding a source.",
    ].join(" ");
  }
  return `${base} Every answer cites its source; when the user asks where something is from, use elephant-open-source on the cited file id.`;
}

/** The `elephant-get-started` card: the whole setup for an empty team, a tour otherwise. */
export function hatchingCard(
  summary: KnowledgeInventorySummary | null,
): string {
  if (summary === null || summary.isEmpty) return hatch();
  return tour(summary);
}

/** What an empty team hears when it asks or searches: the hatch, not an apology. */
export function emptyKnowledgeAnswer(): string {
  return hatch();
}

/** Three example questions, drawn from the team's bucket names when it has them. */
export function hatchingExamples(summary: KnowledgeInventorySummary): string[] {
  const named = summary.bucketNames
    .slice(0, 2)
    .map((name) => `What do we have in ${name}?`);
  const generic = [
    "What does our refund policy say?",
    "Summarize our onboarding guide in five bullets.",
    "Which document mentions pricing, and where?",
  ];
  return [...named, ...generic].slice(0, 3);
}

function hatch(): string {
  return [
    "🐘 **Elephant is connected.** It answers from what your team keeps in Calypso — right now that is nothing, so here is the whole setup:",
    "",
    `1. **Add a first source** — a PDF, a doc or a web page at ${KNOWLEDGE_URL} (a minute, no code).`,
    '2. **Wait for "ready"** (usually under a minute), then ask something only your files know: *"What\'s our refund window?"*',
    '3. **Trust, then verify** — every answer names its source; ask *"where is that from?"* to open it.',
    "",
    "Disconnect any time from **API Keys** in Calypso.",
  ].join("\n");
}

function tour(summary: KnowledgeInventorySummary): string {
  const buckets = plural(summary.bucketCount, "bucket");
  const sources = plural(summary.readyFileCount, "source");
  const examples = hatchingExamples(summary)
    .map((question) => `- *"${question}"*`)
    .join("\n");
  return [
    `🐘 **Elephant is connected** — ${buckets}, ${sources} ready.`,
    "",
    "Try:",
    examples,
    "",
    `Every answer names its source; ask *"where is that from?"* to open it. Add more at ${KNOWLEDGE_URL}.`,
  ].join("\n");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
