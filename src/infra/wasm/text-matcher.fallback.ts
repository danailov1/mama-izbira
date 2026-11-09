/**
 * Pure-TypeScript fallback for the wasm text matcher. It intentionally mirrors
 * `native/textmatch.c` byte-for-byte (same lowercase ranges, same tokenization,
 * same scoring) so behavior is identical whether or not the wasm module loads.
 *
 * Also used by `scripts/bench-textmatch.ts` as the baseline for benchmarks.
 */
import type { TextMatch, TextMatcher } from '@/core/domain/ports/text-matcher'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const MAX_LEV_LEN = 256
const MAX_STR_BYTES = 900

function encode(text: string): Uint8Array {
  const bytes = encoder.encode(text)
  return bytes.length > MAX_STR_BYTES ? bytes.subarray(0, MAX_STR_BYTES) : bytes
}

function isSpace(c: number): boolean {
  return c === 0x20 || (c >= 0x09 && c <= 0x0d)
}

function isAsciiAlnum(c: number): boolean {
  return (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39)
}

function lowerBytes(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length)
  let i = 0
  let j = 0
  while (i < input.length) {
    const a = input[i]
    if (a < 0x80) {
      let c = a
      if (c >= 0x41 && c <= 0x5a) c += 32
      out[j++] = c
      i++
      continue
    }
    if (a === 0xd0 && i + 1 < input.length) {
      const b = input[i + 1]
      if (b >= 0x80 && b <= 0x8f) {
        out[j++] = 0xd1
        out[j++] = b + 0x10
        i += 2
        continue
      }
      if (b >= 0x90 && b <= 0x9f) {
        out[j++] = 0xd0
        out[j++] = b + 0x20
        i += 2
        continue
      }
      if (b >= 0xa0 && b <= 0xaf) {
        out[j++] = 0xd1
        out[j++] = b - 0x20
        i += 2
        continue
      }
    }
    out[j++] = a
    i++
  }
  return out.subarray(0, j)
}

function normLoose(input: Uint8Array): Uint8Array {
  const low = lowerBytes(input)
  const out: number[] = []
  let started = false
  let pending = false
  for (const c of low) {
    if (c < 0x80 && isSpace(c)) {
      if (started) pending = true
      continue
    }
    if (pending) {
      out.push(0x20)
      pending = false
    }
    out.push(c)
    started = true
  }
  return Uint8Array.from(out)
}

function normTight(input: Uint8Array, keepSpace: boolean): Uint8Array {
  const low = lowerBytes(input)
  const out: number[] = []
  let started = false
  let pending = false
  for (const c of low) {
    const alnum = c >= 0x80 || isAsciiAlnum(c)
    if (alnum) {
      if (keepSpace && started && pending) out.push(0x20)
      pending = false
      started = true
      out.push(c)
    } else if (started) {
      pending = true
    }
  }
  return Uint8Array.from(out)
}

function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function tokenize(bytes: Uint8Array): Uint8Array[] {
  const toks: Uint8Array[] = []
  let start = 0
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 0x20) {
      if (i > start) toks.push(bytes.subarray(start, i))
      start = i + 1
    }
  }
  return toks
}

function tokenJaccard(a: Uint8Array[], b: Uint8Array[]): number {
  let ua = 0
  let ub = 0
  let inter = 0
  for (let i = 0; i < a.length; i++) {
    let dup = false
    for (let k = 0; k < i; k++) if (bytesEq(a[i], a[k])) { dup = true; break }
    if (dup) continue
    ua++
    for (let j = 0; j < b.length; j++) if (bytesEq(a[i], b[j])) { inter++; break }
  }
  for (let j = 0; j < b.length; j++) {
    let dup = false
    for (let k = 0; k < j; k++) if (bytesEq(b[j], b[k])) { dup = true; break }
    if (!dup) ub++
  }
  const union = ua + ub - inter
  return union > 0 ? inter / union : 1
}

function levenshtein(a: Uint8Array, b: Uint8Array): number {
  const la = Math.min(a.length, MAX_LEV_LEN)
  const lb = Math.min(b.length, MAX_LEV_LEN)
  let prev = new Int32Array(lb + 1)
  let cur = new Int32Array(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    cur[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const del = prev[j] + 1
      const ins = cur[j - 1] + 1
      const sub = prev[j - 1] + cost
      let m = del < ins ? del : ins
      if (sub < m) m = sub
      cur[j] = m
    }
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return prev[lb]
}

function contains(hay: Uint8Array, need: Uint8Array): boolean {
  if (need.length === 0) return true
  if (need.length > hay.length) return false
  outer: for (let i = 0; i + need.length <= hay.length; i++) {
    for (let j = 0; j < need.length; j++) if (hay[i + j] !== need[j]) continue outer
    return true
  }
  return false
}

function scoreCurrent(qt: Uint8Array, qc: Uint8Array, ct: Uint8Array, cc: Uint8Array): number {
  const maxlen = Math.max(qt.length, ct.length)
  if (maxlen === 0) return 1
  const d = levenshtein(qt, ct)
  const levSim = Math.max(0, 1 - d / maxlen)
  const jac = tokenJaccard(tokenize(qt), tokenize(ct))
  let sc = 0.5 * levSim + 0.5 * jac
  const minc = Math.min(qc.length, cc.length)
  if (minc >= 4 && (contains(qc, cc) || contains(cc, qc))) sc = Math.max(sc, 0.9)
  return Math.min(1, Math.max(0, sc))
}

function analyzeOne(query: Prepared, candidate: string): TextMatch {
  const bytes = encode(candidate)
  const cr = normLoose(bytes)
  const ct = normTight(bytes, true)
  const cc = normTight(bytes, false)
  const exact = bytesEq(query.raw, cr)
  const compactMatch = bytesEq(query.compact, cc)
  const score = exact || compactMatch ? 1 : scoreCurrent(query.tokens, query.compact, ct, cc)
  return { score, exact, compactMatch }
}

interface Prepared {
  raw: Uint8Array
  tokens: Uint8Array
  compact: Uint8Array
}

function prepare(text: string): Prepared {
  const bytes = encode(text)
  return {
    raw: normLoose(bytes),
    tokens: normTight(bytes, true),
    compact: normTight(bytes, false),
  }
}

export class JsTextMatcher implements TextMatcher {
  normalize(text: string): Promise<string> {
    return Promise.resolve(decoder.decode(normLoose(encode(text))))
  }

  similarity(a: string, b: string): Promise<number> {
    const q = prepare(a)
    const bytes = encode(b)
    const cr = normLoose(bytes)
    if (bytesEq(q.raw, cr)) return Promise.resolve(1)
    const cc = normTight(bytes, false)
    if (bytesEq(q.compact, cc)) return Promise.resolve(1)
    return Promise.resolve(scoreCurrent(q.tokens, q.compact, normTight(bytes, true), cc))
  }

  analyze(query: string, candidates: string[]): Promise<TextMatch[]> {
    const q = prepare(query)
    return Promise.resolve(candidates.map((candidate) => analyzeOne(q, candidate)))
  }
}
