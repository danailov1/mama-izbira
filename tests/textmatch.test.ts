import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { JsTextMatcher } from '../src/infra/wasm/text-matcher.fallback'
import { WasmTextMatcher, type TextMatchExports } from '../src/infra/wasm/text-matcher.core'

const wasmPath = fileURLToPath(new URL('../src/infra/wasm/textmatch.wasm', import.meta.url))
const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface Loaded {
  matcher: WasmTextMatcher
  exports: TextMatchExports
  module: WebAssembly.Module
}

async function load(): Promise<Loaded> {
  const bytes = readFileSync(wasmPath)
  const module = new WebAssembly.Module(bytes)
  const instance = await WebAssembly.instantiate(module, {})
  const exports = instance.exports as unknown as TextMatchExports
  return { matcher: new WasmTextMatcher(exports), exports, module }
}

const CASES: Array<[string, string[]]> = [
  ['Chicco Next 2 Me', ['Chicco Next2Me', 'Chicco Best Friend', 'Peg Perego Prima Pappa']],
  ['Peg Perego Prima Pappa', ['Peg Perego Prima Pappa', 'Peg Perego Prima Pappa Follow Me', 'Chicco Next2Me']],
  ['NUK First Choice', ['NUK First Choice', 'NUK First Choice Plus', 'Britax Römer Advansafix i-Size']],
  ['Бебешка количка', ['Бебешка количка', 'Бебешка количка 2 в 1', 'Chicco Next2Me']],
]

describe('WASM text matcher', () => {
  it('matches the JS fallback on flags and scores', async () => {
    const js = new JsTextMatcher()
    const { matcher } = await load()
    for (const [query, candidates] of CASES) {
      const a = await js.analyze(query, candidates)
      const b = await matcher.analyze(query, candidates)
      assert.equal(a.length, b.length)
      for (let i = 0; i < a.length; i++) {
        assert.equal(a[i].exact, b[i].exact, `exact flag for ${query} / ${candidates[i]}`)
        assert.equal(a[i].compactMatch, b[i].compactMatch, `compact flag for ${query} / ${candidates[i]}`)
        assert.ok(
          Math.abs(a[i].score - b[i].score) < 1e-4,
          `score for ${query} / ${candidates[i]}: js=${a[i].score} wasm=${b[i].score}`,
        )
      }
    }
  })

  it('detects spacing variants as equal and keeps clearly different names apart', async () => {
    const { matcher } = await load()
    const [same, different] = await matcher.analyze('Chicco Next 2 Me', ['chicco next2me', 'Peg Perego'])
    assert.equal(same.compactMatch, true)
    assert.equal(same.score, 1)
    assert.ok(different.score < 0.5, `expected a low score, got ${different.score}`)
  })

  it('normalizes loose text like the historical JS helper', async () => {
    const { matcher } = await load()
    assert.equal(await matcher.normalize('  Chicco—Next2Me!  '), 'chicco—next2me!')
    assert.equal(await matcher.normalize('  Chicco   Best Friend  '), 'chicco best friend')
    assert.equal(await matcher.normalize('  КОЛИЧКА   Next2Me '), 'количка next2me')
  })
})

describe('WASM text matcher — memory safety', () => {
  it('is a self-contained module with a fixed memory footprint', async () => {
    const { module, exports, matcher } = await load()

    // No host imports: the module does not allocate, call back, or touch the env.
    assert.equal(WebAssembly.Module.imports(module).length, 0)

    const initial = exports.memory.buffer.byteLength
    // max-memory == initial-memory at link time, so the module cannot grow.
    assert.throws(() => exports.memory.grow(1), RangeError)

    // Repeated use must not grow memory or change results.
    const first = await matcher.analyze('Chicco Next 2 Me', ['Chicco Next2Me', 'Peg Perego'])
    for (let i = 0; i < 100; i++) await matcher.analyze('Chicco Next 2 Me', ['Chicco Next2Me', 'Peg Perego'])
    assert.equal(exports.memory.buffer.byteLength, initial)
    const last = await matcher.analyze('Chicco Next 2 Me', ['Chicco Next2Me', 'Peg Perego'])
    assert.deepEqual(last, first)
  })

  it('rejects an oversized candidate set instead of overrunning the arena', async () => {
    const { matcher } = await load()
    const oversized = Array.from({ length: 900 }, (_, i) => `candidate ${i} ` + 'x'.repeat(900))
    assert.throws(() => matcher.analyze('query', oversized), /arena overflow/)
  })

  it('honors the output cap in the raw normalize ABI', async () => {
    const { exports } = await load()
    const input = encoder.encode('chicco   next2me')
    const base = exports.arena_ptr()
    new Uint8Array(exports.memory.buffer).set(input, base)
    const outPtr = base + 64
    const n = exports.normalize(0, base, input.length, outPtr, 4)
    assert.ok(n <= 4)
    assert.equal(decoder.decode(new Uint8Array(exports.memory.buffer, outPtr, n)), 'chic')
    assert.ok(exports.arena_cap() > 0)
  })

  it('stops safely at malformed or truncated corpus entries', async () => {
    const { exports } = await load()
    const mem = new Uint8Array(exports.memory.buffer)
    const view = new DataView(exports.memory.buffer)
    const base = exports.arena_ptr()

    const query = encoder.encode('chicco')
    mem.set(query, base)
    const corpusPtr = base + 64
    let p = corpusPtr

    const valid = encoder.encode('chicco next2me')
    view.setUint32(p, valid.length, true)
    p += 4
    mem.set(valid, p)
    p += valid.length

    // A header claiming 9999 bytes with no payload.
    view.setUint32(p, 9999, true)
    p += 4
    assert.equal(exports.analyze(base, query.length, corpusPtr, p - corpusPtr, 10), 1)

    // Trailing partial header (2 bytes < 4) must be ignored too.
    view.setUint16(p, 1, true)
    p += 2
    assert.equal(exports.analyze(base, query.length, corpusPtr, p - corpusPtr, 10), 1)

    // Empty corpus.
    assert.equal(exports.analyze(base, query.length, corpusPtr, 0, 10), 0)
  })

  it('handles empty and very long strings identically to the fallback', async () => {
    const js = new JsTextMatcher()
    const { matcher } = await load()

    assert.deepEqual(await matcher.analyze('', []), [])
    assert.equal(await matcher.similarity('', ''), await js.similarity('', ''))

    const long = 'a'.repeat(1500)
    const near = 'a'.repeat(1400) + 'b'
    const wasmRes = await matcher.analyze(long, [near, long])
    const jsRes = await js.analyze(long, [near, long])
    for (let i = 0; i < wasmRes.length; i++) {
      assert.equal(wasmRes[i].exact, jsRes[i].exact)
      assert.equal(wasmRes[i].compactMatch, jsRes[i].compactMatch)
      assert.ok(Math.abs(wasmRes[i].score - jsRes[i].score) < 1e-4)
    }
  })
})
