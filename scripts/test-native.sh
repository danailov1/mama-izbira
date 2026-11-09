#!/usr/bin/env bash
# Compile and run the native harness for native/textmatch.c.
#
# Checks: array-bounds/UB (UBSan: undefined,bounds,object-size), output-cap
# canaries and analyze() tail-canaries, determinism, malformed/truncated corpus
# handling. The module performs no heap allocation at all, so it cannot leak;
# its memory footprint is fixed at link time (also asserted in the wasm tests).
#
# AddressSanitizer is intentionally not used here: it hangs on some macOS hosts.
# The wasm build is additionally checked from JS (tests/textmatch.test.ts) for
# a fixed, non-growing memory and an empty import list.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CC="${CC:-clang}"
OUT="$(mktemp -d)/textmatch_test"
trap 'rm -rf "$(dirname "$OUT")"' EXIT

"$CC" \
  -std=c11 -O1 -g -Wall -Wextra \
  -Wno-pointer-to-int-cast \
  -fsanitize=undefined,bounds,object-size \
  -fno-sanitize-recover=all \
  -fno-omit-frame-pointer \
  "$ROOT/native/textmatch_test.c" \
  -o "$OUT"

UBSAN_OPTIONS="halt_on_error=1:print_stacktrace=1" "$OUT"
