/**
 * The non-secret facts of an OAuth grant, for logs and operator notices:
 * which grant, which team, which client, which person. Never the key.
 */
export type GrantFacts = {
  readonly gid: string;
  readonly team?: string;
  readonly cid?: string;
  readonly sub?: string;
};

/**
 * What an authenticated request carries into the tool layer: the Calypso API
 * key every tool call is made with, and a non-secret label for logs.
 */
export type Credential = {
  readonly apiKey: string;
  /** Safe to log: `grant:<gid>` or `key:sk-…abcd`. Never the key itself. */
  readonly principal: string;
  /** OAuth scopes granted, empty for raw API keys (which carry all). */
  readonly scopes: readonly string[];
  /** Present for an OAuth grant; a raw API key has none. */
  readonly grant?: GrantFacts;
};
