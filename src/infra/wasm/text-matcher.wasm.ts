/**
 * Browser entry point: fetches the wasm module emitted by Vite and wires it to
 * the shared driver. Kept separate from the driver so the driver stays free of
 * Vite-only imports (`?url`).
 */
import wasmUrl from './textmatch.wasm?url'
import { WasmTextMatcher, type TextMatchExports } from './text-matcher.core'

async function instantiate(url: string): Promise<TextMatchExports> {
  const response = await fetch(url)
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(response.clone(), {})
      return instance.exports as unknown as TextMatchExports
    } catch {
      // Fall through to the buffer path (e.g. non-application/wasm MIME type).
    }
  }
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {})
  return instance.exports as unknown as TextMatchExports
}

export async function createWasmTextMatcher(): Promise<WasmTextMatcher> {
  return new WasmTextMatcher(await instantiate(wasmUrl))
}
