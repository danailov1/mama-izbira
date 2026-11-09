/**
 * The wasm driver, decoupled from how the module is loaded. Kept free of any
 * Vite-specific imports so it can also be exercised from Node (benchmarks).
 */
import type { TextMatch, TextMatcher } from '@/core/domain/ports/text-matcher'

const MAX_STR_BYTES = 900
const MAX_CANDIDATES = 2000

export interface TextMatchExports {
  memory: WebAssembly.Memory
  arena_ptr(): number
  arena_cap(): number
  scores_ptr(): number
  flags_ptr(): number
  normalize(mode: number, inPtr: number, inLen: number, outPtr: number, outCap: number): number
  similarity(aPtr: number, aLen: number, bPtr: number, bLen: number): number
  analyze(qPtr: number, qLen: number, cPtr: number, cLen: number, maxOut: number): number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const align4 = (n: number) => (n + 3) & ~3

export class WasmTextMatcher implements TextMatcher {
  constructor(private readonly ex: TextMatchExports) {}

  private encode(text: string): Uint8Array {
    const bytes = encoder.encode(text)
    return bytes.length > MAX_STR_BYTES ? bytes.subarray(0, MAX_STR_BYTES) : bytes
  }

  normalize(text: string): Promise<string> {
    const ex = this.ex
    const input = this.encode(text)
    const mem = new Uint8Array(ex.memory.buffer)
    const base = ex.arena_ptr()
    mem.set(input, base)
    const outPtr = base + align4(input.length)
    const outCap = Math.min(ex.arena_cap() - (outPtr - base), 4096)
    const len = ex.normalize(0, base, input.length, outPtr, outCap)
    return Promise.resolve(decoder.decode(new Uint8Array(ex.memory.buffer, outPtr, len)))
  }

  similarity(a: string, b: string): Promise<number> {
    const ex = this.ex
    const ab = this.encode(a)
    const bb = this.encode(b)
    const mem = new Uint8Array(ex.memory.buffer)
    const base = ex.arena_ptr()
    mem.set(ab, base)
    const bPtr = base + align4(ab.length)
    mem.set(bb, bPtr)
    return Promise.resolve(ex.similarity(base, ab.length, bPtr, bb.length))
  }

  analyze(query: string, candidates: string[]): Promise<TextMatch[]> {
    const ex = this.ex
    const q = this.encode(query)
    const list = candidates.slice(0, MAX_CANDIDATES).map((c) => this.encode(c))

    const base = ex.arena_ptr()
    const qPtr = base
    const corpusPtr = base + align4(q.length)
    let size = 4 + q.length
    for (const item of list) size += 4 + item.length
    if (qPtr + size > base + ex.arena_cap()) {
      throw new Error('textmatch: arena overflow')
    }

    const mem = new Uint8Array(ex.memory.buffer)
    const view = new DataView(ex.memory.buffer)
    mem.set(q, qPtr)
    let p = corpusPtr
    for (const item of list) {
      view.setUint32(p, item.length, true)
      p += 4
      mem.set(item, p)
      p += item.length
    }

    const count = ex.analyze(qPtr, q.length, corpusPtr, p - corpusPtr, list.length)
    const scores = new Float32Array(ex.memory.buffer, ex.scores_ptr(), count)
    const flags = new Uint32Array(ex.memory.buffer, ex.flags_ptr(), count)

    const out: TextMatch[] = new Array(list.length)
    for (let i = 0; i < list.length; i++) {
      if (i < count) {
        out[i] = {
          score: scores[i],
          exact: (flags[i] & 1) !== 0,
          compactMatch: (flags[i] & 2) !== 0,
        }
      } else {
        out[i] = { score: 0, exact: false, compactMatch: false }
      }
    }
    return Promise.resolve(out)
  }
}
