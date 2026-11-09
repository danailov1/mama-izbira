/**
 * Benchmark + parity check for the C/WASM text matcher.
 *
 *   npm run bench:textmatch
 *
 * 1. Verifies the JS fallback and the wasm module produce identical flags and
 *    near-identical scores on the real seed catalog.
 * 2. Measures analyze() and similarity() throughput for both implementations.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JsTextMatcher } from '../src/infra/wasm/text-matcher.fallback'
import { WasmTextMatcher, type TextMatchExports } from '../src/infra/wasm/text-matcher.core'

interface SeedProduct {
  brand: string
  model: string
}

interface SeedData {
  products: SeedProduct[]
}

const wasmPath = fileURLToPath(new URL('../src/infra/wasm/textmatch.wasm', import.meta.url))
const seedPath = fileURLToPath(new URL('./seed-data.json', import.meta.url))

function loadCorpus(): string[] {
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedData
  const titles = seed.products.map((p) => `${p.brand} ${p.model}`)
  // Expand the corpus to a realistic size for benchmarking by appending variant
  // suffixes (the scoring cost is per-candidate, so this models a large catalog).
  const variants = ['', ' Magic', ' Plus', ' 2', ' Lite', ' Pro', ' Comfort', ' Sport']
  const corpus: string[] = []
  for (const title of titles) {
    for (const v of variants) {
      for (let k = 1; k <= 8; k++) corpus.push(`${title}${v} ${k}`)
    }
  }
  return corpus
}

async function loadWasm(): Promise<WasmTextMatcher> {
  const bytes = readFileSync(wasmPath)
  const { instance } = await WebAssembly.instantiate(bytes, {})
  return new WasmTextMatcher(instance.exports as unknown as TextMatchExports)
}

async function parity(js: JsTextMatcher, wasm: WasmTextMatcher, corpus: string[]): Promise<boolean> {
  const queries = ['Chicco Next 2 Me', 'Peg Perego Prima Pappa', 'Maxi Cosi Pearl', 'Бебешка количка', 'NUK First Choice']
  let ok = true
  let maxDelta = 0
  for (const query of queries) {
    const a = await js.analyze(query, corpus)
    const b = await wasm.analyze(query, corpus)
    for (let i = 0; i < a.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(a[i].score - b[i].score))
      if (a[i].exact !== b[i].exact || a[i].compactMatch !== b[i].compactMatch) {
        ok = false
        console.error(`flag mismatch for "${query}" / "${corpus[i]}"`, a[i], b[i])
      }
      if (Math.abs(a[i].score - b[i].score) > 1e-4) {
        ok = false
        console.error(`score mismatch for "${query}" / "${corpus[i]}"`, a[i].score, b[i].score)
      }
    }
  }
  console.log(`Parity: ${ok ? 'OK' : 'FAILED'} · max score delta ${maxDelta.toExponential(2)}`)
  return ok
}

async function main() {
  const corpus = loadCorpus()
  const queries = corpus.filter((_, i) => i % 17 === 0).slice(0, 120)
  const js = new JsTextMatcher()
  const wasm = await loadWasm()

  console.log(`Corpus: ${corpus.length} titles · ${queries.length} queries\n`)

  const ok = await parity(js, wasm, corpus)

  // Deterministic, allocation-light loop: both implementations are async but the
  // work is synchronous, so awaiting resolves immediately.
  const runAnalyze = async (matcher: JsTextMatcher | WasmTextMatcher) => {
    for (const q of queries) await matcher.analyze(q, corpus)
  }
  const runSimilarity = async (matcher: JsTextMatcher | WasmTextMatcher) => {
    for (const q of queries) {
      for (let i = 0; i < 20; i++) await matcher.similarity(q, corpus[i])
    }
  }

  // Warm-up (JIT / wasm tier-up).
  await runAnalyze(js)
  await runAnalyze(wasm)

  let t = performance.now()
  await runAnalyze(js)
  const jsAnalyzeMs = performance.now() - t

  t = performance.now()
  await runAnalyze(wasm)
  const wasmAnalyzeMs = performance.now() - t

  t = performance.now()
  await runSimilarity(js)
  const jsSimMs = performance.now() - t

  t = performance.now()
  await runSimilarity(wasm)
  const wasmSimMs = performance.now() - t

  const comparisons = queries.length * corpus.length
  const simCalls = queries.length * 20

  console.log('\nanalyze():')
  console.log(`  JS  fallback : ${jsAnalyzeMs.toFixed(1)} ms  (${((comparisons / jsAnalyzeMs) * 1000).toFixed(0)} comparisons/s)`)
  console.log(`  C → WASM     : ${wasmAnalyzeMs.toFixed(1)} ms  (${((comparisons / wasmAnalyzeMs) * 1000).toFixed(0)} comparisons/s)`)
  console.log(`  speedup      : ${(jsAnalyzeMs / wasmAnalyzeMs).toFixed(2)}×`)

  console.log('\nsimilarity():')
  console.log(`  JS  fallback : ${jsSimMs.toFixed(1)} ms  (${((simCalls / jsSimMs) * 1000).toFixed(0)} calls/s)`)
  console.log(`  C → WASM     : ${wasmSimMs.toFixed(1)} ms  (${((simCalls / wasmSimMs) * 1000).toFixed(0)} calls/s)`)
  console.log(`  speedup      : ${(jsSimMs / wasmSimMs).toFixed(2)}×`)

  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
