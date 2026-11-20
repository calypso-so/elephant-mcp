/** The depths a caller may ask for, shallowest first. */
export const ANSWER_DEPTHS = ["fast", "balanced", "deep"] as const;
export type AnswerDepthName = (typeof ANSWER_DEPTHS)[number];

/** The depths a search may run at. */
export const SEARCH_DEPTHS = ["fast", "thorough"] as const;
export type SearchDepthName = (typeof SEARCH_DEPTHS)[number];

/**
 * How much work an answer is worth: which Calypso response tier writes it.
 *
 * Callers pick a depth in plain words; the Calypso API speaks in response
 * policies (`fast`, `medium`, `extended`) and reports the tier it actually
 * used as an OpenAI reasoning effort. This class is the only place that knows
 * both vocabularies, so a tool never has to.
 */
export class AnswerDepth {
  private static readonly ALL: readonly AnswerDepth[] = [
    new AnswerDepth("fast", "fast", ["minimal", "low"]),
    new AnswerDepth("balanced", "medium", ["medium"]),
    new AnswerDepth("deep", "extended", ["high"]),
  ];

  private constructor(
    readonly name: AnswerDepthName,
    /** The `response_policy` the Calypso API takes. */
    readonly responsePolicy: "fast" | "medium" | "extended",
    private readonly efforts: readonly string[],
  ) {}

  /** The depth a caller named; undefined when none was asked for. */
  static named(name: string | undefined): AnswerDepth | undefined {
    const wanted = String(name ?? "")
      .trim()
      .toLowerCase();
    return AnswerDepth.ALL.find((depth) => depth.name === wanted);
  }

  /** The depth a finished response says it ran at, from its reasoning effort. */
  static used(response: unknown): AnswerDepth | undefined {
    const reasoning =
      response !== null && typeof response === "object"
        ? (response as { reasoning?: { effort?: unknown } }).reasoning
        : undefined;
    const effort = String(reasoning?.effort ?? "")
      .trim()
      .toLowerCase();
    return AnswerDepth.ALL.find((depth) => depth.efforts.includes(effort));
  }

  /** Whether this depth does less work than the other. */
  isShallowerThan(other: AnswerDepth): boolean {
    return AnswerDepth.ALL.indexOf(this) < AnswerDepth.ALL.indexOf(other);
  }
}

/** The search depth the Calypso API takes for a caller's word. */
export function searchDepthForApi(
  depth: SearchDepthName | undefined,
  extraQueries: number,
): "fast" | "standard" | undefined {
  // Extra phrasings only run at the deeper setting, so naming any asks for it.
  if (depth === "thorough" || extraQueries > 0) return "standard";
  return depth === "fast" ? "fast" : undefined;
}
