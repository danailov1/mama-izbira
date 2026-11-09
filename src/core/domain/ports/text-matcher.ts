/**
 * Text matching port — normalization + fuzzy similarity for duplicate detection
 * and search ranking. Implemented by a wasm module (primary) with a pure-TS
 * fallback, so the domain layer never knows which one is running.
 */
export interface TextMatch {
  /** 0..1 similarity between the query and the candidate. */
  score: number
  /** Loose-normalized equality (same as the historical `norm` comparison). */
  exact: boolean
  /** Compact equality (ignores spaces/punctuation): "Next2Me" === "Next 2 Me". */
  compactMatch: boolean
}

export interface TextMatcher {
  /** Loose normalization: lowercase, trim, collapse whitespace. */
  normalize(text: string): Promise<string>
  /** 0..1 similarity between two strings (same rules as analyze). */
  similarity(a: string, b: string): Promise<number>
  /** Score every candidate against the query, preserving input order. */
  analyze(query: string, candidates: string[]): Promise<TextMatch[]>
}
