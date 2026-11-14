/**
 * Small readers for untyped API payloads.
 *
 * The Calypso API grows fields over time and older deployments omit some, so
 * responses are read defensively rather than trusted to match a type.
 */

/** A non-empty trimmed string, or undefined for anything else. */
export function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Trimmed, non-empty, de-duplicated strings in first-seen order. */
export function uniqueStrings(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [];
  const trimmed = items.map((item) => String(item || "").trim());
  return [...new Set(trimmed.filter(Boolean))];
}

/** Trimmed non-empty strings, or undefined when none remain. */
export function compactStrings(values?: string[]): string[] | undefined {
  const out = (values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return out.length > 0 ? out : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
