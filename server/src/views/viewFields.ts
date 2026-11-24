import {
  asRecord,
  numberOrUndefined,
  trimmedString,
} from "../calypso/coerce.js";

/**
 * What every view is built from.
 *
 * A view names each field it returns. Nothing the Calypso API sends reaches a
 * client because it happened to be in the payload: the API's records also
 * carry what only Calypso needs (which key added a file, index store and
 * operation names, task and request ids), and none of that is the user's to
 * read or a model's to repeat.
 */

/** Names of index stores, operations and storage objects: never shown. */
const INTERNAL_PATH = /fileSearchStores\/|\boperations\/|\bgs:\/\//;
const MAX_TEXT = 300;

/** The fields that are present, in the order given. */
export function present<T extends Record<string, unknown>>(
  fields: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  ) as Partial<T>;
}

/**
 * A short explanation the API wrote for a person (why a file failed, why a
 * source did not move). Dropped when it names an internal path.
 */
export function plainText(value: unknown): string | undefined {
  const text = trimmedString(value);
  if (!text || INTERNAL_PATH.test(text)) return undefined;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

/** Bucket ids out of an assignment list, whose entries are ids or records. */
export function bucketIds(value: unknown): string[] | undefined {
  const ids = (Array.isArray(value) ? value : [])
    .map((entry) => {
      const record = asRecord(entry);
      return trimmedString(
        record ? (record.id ?? record.bucket_id ?? record.slug) : entry,
      );
    })
    .filter((id): id is string => Boolean(id));
  return ids.length ? [...new Set(ids)] : undefined;
}

export { asRecord, numberOrUndefined, trimmedString };
