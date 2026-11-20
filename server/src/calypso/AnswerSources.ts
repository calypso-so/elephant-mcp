/** One source an answer was grounded in, as a reader should see it. */
export type AnswerSource = {
  /** File name, page title or URL: what the source is called. */
  readonly label: string;
  /** The source's id, usable with `elephant-open-source`. */
  readonly fileId?: string;
  readonly url?: string;
  /** Where in the source, when the answer names a place ("p. 4"). */
  readonly locator?: string;
};

type Json = Record<string, unknown>;

/**
 * The sources a completed agent response says it used.
 *
 * The Calypso API streams the answer as text and reports its sources on the
 * finished response, not inside the text: in `metadata._aicore.grounded_sources`
 * and as `annotations` on the output text. A reader of the text alone sees an
 * answer with no source, so they are read here and written out under it.
 */
export class AnswerSources {
  private constructor(readonly items: readonly AnswerSource[]) {}

  /** No sources: an answer that names none, or one not finished yet. */
  static none(): AnswerSources {
    return new AnswerSources([]);
  }

  /** Sources of a `response.completed` payload; empty when it names none. */
  static fromResponse(response: unknown): AnswerSources {
    const grounded = AnswerSources.fromGroundedSources(response);
    const found = grounded.length
      ? grounded
      : AnswerSources.fromAnnotations(response);
    return new AnswerSources(AnswerSources.distinct(found));
  }

  get count(): number {
    return this.items.length;
  }

  /** The block appended under an answer; empty when there are no sources. */
  render(): string {
    if (!this.items.length) return "";
    const lines = this.items.map((source, index) => {
      const details = [
        source.locator,
        source.fileId ? `file id ${source.fileId}` : undefined,
        source.url && source.url !== source.label ? source.url : undefined,
      ].filter(Boolean);
      const suffix = details.length ? ` (${details.join(", ")})` : "";
      return `${index + 1}. ${source.label}${suffix}`;
    });
    return `Sources:\n${lines.join("\n")}`;
  }

  private static fromGroundedSources(response: unknown): AnswerSource[] {
    const metadata = AnswerSources.object(
      AnswerSources.object(response).metadata,
    );
    const items = AnswerSources.object(metadata._aicore).grounded_sources;
    return AnswerSources.list(items).flatMap((item) => {
      const url = AnswerSources.text(item.url);
      const label =
        AnswerSources.text(item.filename) ??
        AnswerSources.text(item.title) ??
        AnswerSources.text(item.label) ??
        url;
      if (!label) return [];
      const page = item.page_number;
      const locator =
        AnswerSources.text(item.page_label) ??
        AnswerSources.text(item.locator_label) ??
        (typeof page === "number" ? `p. ${page}` : undefined);
      return [
        {
          label,
          fileId: AnswerSources.text(item.knowledge_id),
          url,
          locator,
        },
      ];
    });
  }

  private static fromAnnotations(response: unknown): AnswerSource[] {
    const output = AnswerSources.list(AnswerSources.object(response).output);
    const annotations = output
      .flatMap((item) => AnswerSources.list(item.content))
      .flatMap((part) => AnswerSources.list(part.annotations));
    return annotations.flatMap((annotation) => {
      const url = AnswerSources.text(annotation.url);
      const label =
        AnswerSources.text(annotation.filename) ??
        AnswerSources.text(annotation.title) ??
        url;
      if (!label) return [];
      return [{ label, fileId: AnswerSources.text(annotation.file_id), url }];
    });
  }

  /** One line per source and place: a file cited five times is listed once. */
  private static distinct(sources: readonly AnswerSource[]): AnswerSource[] {
    const seen = new Set<string>();
    return sources.filter((source) => {
      const key = [
        source.fileId ?? source.url ?? source.label,
        source.locator ?? "",
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private static object(value: unknown): Json {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Json)
      : {};
  }

  private static list(value: unknown): Json[] {
    return Array.isArray(value) ? value.map(AnswerSources.object) : [];
  }

  private static text(value: unknown): string | undefined {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  }
}
