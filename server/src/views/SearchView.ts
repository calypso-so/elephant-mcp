import {
  asRecord,
  numberOrUndefined,
  present,
  trimmedString,
} from "./viewFields.js";

export type PublicSearchResult = {
  source_index?: number;
  type?: string;
  title?: string;
  /** The whole matching passage, as the document has it. */
  text?: string;
  /** The line in the passage that matched most closely. */
  quote?: string;
  /** The source's file id, usable with `elephant-open-source`. */
  file_id?: string;
  filename?: string;
  url?: string;
  page?: number;
  /** Where in the source, as the document labels it ("p. 4"). */
  location?: string;
};

export type PublicSearch = {
  query?: string;
  /** The depth the search ran at: `fast` or `thorough`. */
  depth?: string;
  results: PublicSearchResult[];
};

/** A search depth as the API names it, to the name the tool takes. */
const DEPTH_NAMES: Record<string, string> = {
  fast: "fast",
  standard: "thorough",
};

/**
 * The passages a search found and where each is from. The API's answer also
 * says which agent and retrieval strategy ran, what it cost in tokens, and
 * for each passage its index and storage references; a view carries none.
 */
export class SearchView {
  private constructor(private readonly search: Record<string, unknown>) {}

  static of(value: unknown): PublicSearch {
    return new SearchView(asRecord(value) ?? {}).fields();
  }

  private fields(): PublicSearch {
    const search = this.search;
    return present({
      query: trimmedString(search.query),
      depth: DEPTH_NAMES[trimmedString(search.depth) ?? ""],
      results: (Array.isArray(search.results) ? search.results : []).map(
        SearchView.result,
      ),
    }) as PublicSearch;
  }

  private static result(value: unknown): PublicSearchResult {
    const result = asRecord(value) ?? {};
    const attributes = asRecord(result.attributes) ?? {};
    return present({
      source_index: numberOrUndefined(result.source_index),
      type: trimmedString(result.type),
      title: trimmedString(result.title),
      text: trimmedString(result.text),
      quote: trimmedString(result.quote),
      // The knowledge id is the one the other tools take.
      file_id:
        trimmedString(attributes.knowledge_id) ??
        SearchView.plainId(result.file_id),
      filename: trimmedString(result.filename),
      url: trimmedString(result.url),
      page: numberOrUndefined(attributes.page_number),
      location:
        trimmedString(attributes.locator_label) ??
        trimmedString(attributes.page_label),
    }) as PublicSearchResult;
  }

  /** An id, never a path into the index. */
  private static plainId(value: unknown): string | undefined {
    const id = trimmedString(value);
    return id && !id.includes("/") ? id : undefined;
  }
}
