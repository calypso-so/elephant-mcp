/**
 * What the API says about how an answer was produced, beyond its text:
 * `metadata._aicore.answer_failure_code` when retrieval could not run as
 * asked, and `metadata._aicore.bucket_coverage` when some buckets in scope
 * were not read.
 *
 * Without this, a refusal with a precise cause ("that source is in a bucket
 * this agent does not read") reaches the caller as the generic "not enough
 * information", and the caller concludes the knowledge is missing.
 */
export type BucketCoverage = {
  readonly searched: readonly string[];
  readonly unsearched: readonly string[];
};

/** Retrieval failures a caller can act on, in the words it should act on. */
const REASONS: Readonly<Record<string, string>> = {
  attached_source_outside_scope:
    "A source in `fileIds` is in a bucket the agent named in `model` does not read. Ask again without `model` (Elephant then reads every bucket), or without `fileIds`.",
  bucket_outside_agent_scope:
    "The agent named in `model` does not read one of the buckets in `buckets`. Ask again without `model` (Elephant then reads every bucket), or name only that agent's buckets.",
  bucket_scope_unsupported:
    "The agent named in `model` does not read buckets, so it cannot be limited to some. Ask again without `buckets`, or without `model`.",
  bucket_store_indexing_pending:
    "The buckets to answer from have nothing indexed yet. Files usually finish indexing within a minute; ask again shortly.",
  attached_source_unavailable:
    "A source in `fileIds` is still being indexed. Ask again in a minute, or without `fileIds`.",
  attached_source_lookup_failed:
    "Elephant could not check where a source in `fileIds` lives. Ask again.",
  attached_sources_mixed_storage:
    "The sources in `fileIds` live in different places and could not be read together. Ask about them in separate questions.",
  bucket_store_limit_exceeded:
    "The agent named in `model` reads more buckets than one question can. Ask again without `model`, or name up to five `buckets`.",
  bucket_cover_unresolved:
    "Elephant could not work out which buckets hold the sources in `fileIds`. Ask again with fewer of them, or name the `buckets`.",
};

export class AnswerDiagnostics {
  private constructor(
    readonly failureCode: string | null,
    readonly coverage: BucketCoverage | null,
  ) {}

  static none(): AnswerDiagnostics {
    return new AnswerDiagnostics(null, null);
  }

  static fromResponse(response: unknown): AnswerDiagnostics {
    const aicore = record(record(record(response)?.metadata)?._aicore);
    const code =
      typeof aicore?.answer_failure_code === "string"
        ? aicore.answer_failure_code.trim() || null
        : null;
    const raw = record(aicore?.bucket_coverage);
    const unsearched = strings(raw?.unsearched);
    const coverage = unsearched.length
      ? { searched: strings(raw?.searched), unsearched }
      : null;
    return new AnswerDiagnostics(code, coverage);
  }

  /** What to tell the caller instead of the answer text, when retrieval could not run. */
  failureReason(): string | null {
    return this.failureCode ? (REASONS[this.failureCode] ?? null) : null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item)
    : [];
}
