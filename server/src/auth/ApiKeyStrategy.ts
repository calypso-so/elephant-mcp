import type { AuthStrategy } from "./AuthStrategy.js";
import type { Credential } from "./Credential.js";

const API_KEY_SHAPE = /^sk-[A-Za-z0-9_-]{16,}$/;

/**
 * `Authorization: Bearer sk-…` — a Calypso project API key, passed through.
 *
 * AIcore is the authority on whether the key is valid and what it may do, so
 * this strategy only checks the shape; a bad key fails on the first tool call
 * with AIcore's own error. Keys are accepted only in the header, never in the
 * URL, so they stay out of access logs.
 */
export class ApiKeyStrategy implements AuthStrategy {
  accepts(token: string): boolean {
    return API_KEY_SHAPE.test(token);
  }

  async authenticate(token: string): Promise<Credential> {
    return {
      apiKey: token,
      principal: `key:sk-…${token.slice(-4)}`,
      scopes: [],
    };
  }
}
