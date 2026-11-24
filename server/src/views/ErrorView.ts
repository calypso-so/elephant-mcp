/**
 * A failure, as the client may read it.
 *
 * An error message is written for whoever has to act on it: a refusal code,
 * what was wrong with the input, what to try next. The API's errors can also
 * carry what only Calypso needs to trace a call, so a message is cleared of
 * request, task, key and workspace ids and of index paths before it leaves.
 * The server's own log keeps the message as it was.
 */
const INTERNAL_KEYS = [
  "request_id",
  "task_id",
  "api_key_id",
  "team_id",
  "trace_id",
  "operation_name",
  "document_name",
  "store_name",
].join("|");

/** `"task_id": "…"` inside the JSON details of an API error. */
const JSON_PAIR = new RegExp(
  `,?\\s*"(?:${INTERNAL_KEYS})"\\s*:\\s*(?:"[^"]*"|[^,}\\]]+)`,
  "g",
);
/** `task_id=…` in a sentence. */
const KEY_VALUE = new RegExp(`\\s*\\b(?:${INTERNAL_KEYS})=\\S+`, "g");
const INDEX_PATH = /fileSearchStores\/[\w\-/]+/g;

export class ErrorView {
  private constructor(private readonly message: string) {}

  static of(message: string): string {
    return new ErrorView(message).text();
  }

  private text(): string {
    return (
      this.message
        .replace(JSON_PAIR, "")
        .replace(KEY_VALUE, "")
        // A pair removed from the front of an object leaves its comma behind.
        .replace(/([{[])\s*,\s*/g, "$1")
        .replace(/\s*details=\{\s*\}/g, "")
        .replace(INDEX_PATH, "the index")
        .trim()
    );
  }
}
