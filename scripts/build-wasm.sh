#!/usr/bin/env bash
# Build native/textmatch.c -> src/infra/wasm/textmatch.wasm
#
# The module is freestanding (no libc, no malloc), so any clang with the wasm32
# backend + wasm-ld works. Recommended: wasi-sdk.
#
#   WASI_SDK_PATH=/path/to/wasi-sdk ./scripts/build-wasm.sh
#
# If WASI_SDK_PATH is not set, the script probes common locations and PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/textmatch.c"
OUT="$ROOT/src/infra/wasm/textmatch.wasm"
mkdir -p "$(dirname "$OUT")"

find_clang() {
  if [[ -n "${WASI_SDK_PATH:-}" && -x "$WASI_SDK_PATH/bin/clang" ]]; then
    echo "$WASI_SDK_PATH/bin/clang"; return
  fi
  for base in "$HOME/.local/wasi-sdk" /opt/wasi-sdk /usr/local/opt/wasi-sdk; do
    if [[ -x "$base/bin/clang" ]]; then echo "$base/bin/clang"; return; fi
  done
  if command -v wasm32-wasip1-clang >/dev/null 2>&1; then
    command -v wasm32-wasip1-clang; return
  fi
  # Last resort: verify whatever clang we have actually supports wasm32.
  if command -v clang >/dev/null 2>&1 && \
     printf 'int x;' | clang --target=wasm32 -ffreestanding -nostdlib -c -x c - -o /dev/null 2>/dev/null; then
    command -v clang; return
  fi
  echo ""
}

CLANG="$(find_clang)"
if [[ -z "$CLANG" ]]; then
  cat >&2 <<'EOF'
No clang with a wasm32 backend found.

Install wasi-sdk and re-run with WASI_SDK_PATH:

  https://github.com/WebAssembly/wasi-sdk/releases

  WASI_SDK_PATH=/path/to/wasi-sdk ./scripts/build-wasm.sh

(or place it at ~/.local/wasi-sdk)
EOF
  exit 1
fi

echo "Building $SRC with $CLANG"
"$CLANG" \
  --target=wasm32 \
  -O3 \
  -ffreestanding -nostdlib -fno-builtin \
  -Wl,--no-entry \
  -Wl,--export-memory \
  -Wl,--initial-memory=2097152 \
  -Wl,--max-memory=2097152 \
  -Wl,-z,stack-size=131072 \
  -o "$OUT" "$SRC"

echo "Wrote $(ls -lh "$OUT" | awk '{print $5}') -> ${OUT#"$ROOT"/}"
