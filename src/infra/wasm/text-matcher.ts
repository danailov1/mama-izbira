/**
 * Lazy provider for the text matcher. The wasm module is code-split and fetched
 * on first use; if it fails to load (unsupported env, missing MIME type, offline)
 * we transparently fall back to the pure-TS implementation.
 */
import type { TextMatch, TextMatcher } from '@/core/domain/ports/text-matcher'
import { JsTextMatcher } from './text-matcher.fallback'

let pending: Promise<TextMatcher> | null = null

async function load(): Promise<TextMatcher> {
  try {
    const { createWasmTextMatcher } = await import('./text-matcher.wasm')
    return await createWasmTextMatcher()
  } catch (error) {
    console.warn('[textmatch] wasm unavailable — using JS fallback', error)
    return new JsTextMatcher()
  }
}

export function getTextMatcher(): Promise<TextMatcher> {
  if (!pending) pending = load()
  return pending
}

/** Synchronous-looking façade that resolves the implementation on first call. */
export class LazyTextMatcher implements TextMatcher {
  private impl: Promise<TextMatcher> | null = null

  private resolve(): Promise<TextMatcher> {
    if (!this.impl) this.impl = getTextMatcher()
    return this.impl
  }

  normalize(text: string): Promise<string> {
    return this.resolve().then((m) => m.normalize(text))
  }

  similarity(a: string, b: string): Promise<number> {
    return this.resolve().then((m) => m.similarity(a, b))
  }

  analyze(query: string, candidates: string[]): Promise<TextMatch[]> {
    return this.resolve().then((m) => m.analyze(query, candidates))
  }
}

export type { TextMatch, TextMatcher }
