import {
  asRecord,
  numberOrUndefined,
  plainText,
  present,
  trimmedString,
} from "./viewFields.js";

/** How a move went, source by source. */
export type PublicMove = {
  /** The bucket the sources went into. */
  bucket_id?: string;
  from_bucket_id?: string;
  moved?: number;
  requested?: number;
  /** One entry per source: `moved`, or why it was not. */
  sources: Array<{ id?: string; status?: string; detail?: string }>;
};

export class MoveView {
  private constructor(private readonly move: Record<string, unknown>) {}

  static of(value: unknown): PublicMove {
    return new MoveView(asRecord(value) ?? {}).fields();
  }

  private fields(): PublicMove {
    const move = this.move;
    return present({
      bucket_id: trimmedString(move.bucket_id),
      from_bucket_id: trimmedString(move.from_bucket_id),
      moved: numberOrUndefined(move.moved),
      requested: numberOrUndefined(move.requested),
      sources: (Array.isArray(move.sources) ? move.sources : []).map(
        (entry) => {
          const source = asRecord(entry) ?? {};
          return present({
            id: trimmedString(source.id),
            status: trimmedString(source.status),
            detail: plainText(source.detail),
          });
        },
      ),
    }) as PublicMove;
  }
}
