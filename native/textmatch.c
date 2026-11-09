/*
 * textmatch.c — CPU-bound text normalization + fuzzy similarity for мамаИзбира.
 *
 * Compiled to a freestanding wasm32 module (no libc, no malloc). All buffers are
 * static; the JS host writes UTF-8 input into the exported arena and reads results
 * from the exported scores/flags arrays. Because there is no heap, the module
 * cannot leak — its memory footprint is fixed at link time.
 *
 * Supported lowercase mapping (byte-level, UTF-8):
 *   - ASCII A-Z
 *   - Cyrillic А..Я   (U+0410..U+042F)
 *   - Cyrillic Ѐ..Џ   (U+0400..U+040F, includes Ё)
 * Everything else is passed through unchanged.
 *
 * Modes for normalize():
 *   0 = loose  : lowercase + trim + collapse whitespace (parity with the old JS `norm`)
 *   1 = tokens : lowercase, keep [a-z0-9] + non-ASCII, other bytes become single spaces
 *   2 = compact: lowercase, keep [a-z0-9] + non-ASCII, drop separators entirely
 *
 * score(a,b) in [0,1]:
 *   0.5 * (1 - levenshtein/tokenMaxLen) + 0.5 * tokenJaccard
 *   boosted to >= 0.9 when one compact form contains the other (min len 4).
 *
 * exported ABI (all pointers are 32-bit wasm offsets):
 *   u32  arena_ptr()
 *   u32  arena_cap()
 *   u32  scores_ptr()
 *   u32  flags_ptr()
 *   i32  normalize(mode, in_ptr, in_len, out_ptr, out_cap)
 *   f64  similarity(a_ptr, a_len, b_ptr, b_len)
 *   u32  analyze(q_ptr, q_len, corpus_ptr, corpus_len, max_out)
 *
 * analyze() corpus format: sequence of [u32 little-endian length][utf-8 bytes].
 * flags bit0 = loose-normalized equality, bit1 = compact equality.
 */

#include <stdint.h>

#define ARENA_CAP       (512u * 1024u)
#define MAX_STR         1024u
#define MAX_TOKENS      32
#define MAX_CANDIDATES  4096
#define MAX_LEV_LEN     256

#if defined(__wasm__)
#define WASM_EXPORT(name) __attribute__((export_name(name)))
#else
#define WASM_EXPORT(name)
#endif

static uint8_t  arena[ARENA_CAP];
static uint8_t  q_raw[MAX_STR];
static uint8_t  q_tok[MAX_STR];
static uint8_t  q_cmp[MAX_STR];
static uint8_t  c_raw[MAX_STR];
static uint8_t  c_tok[MAX_STR];
static uint8_t  c_cmp[MAX_STR];
static float    out_scores[MAX_CANDIDATES];
static uint32_t out_flags[MAX_CANDIDATES];

/* lengths of the currently-prepared query/candidate token+compact forms */
static int q_tok_len = 0;
static int q_cmp_len = 0;
static int c_tok_len = 0;
static int c_cmp_len = 0;

WASM_EXPORT("arena_ptr") uint32_t arena_ptr(void) {
  return (uint32_t)(uintptr_t)arena;
}
WASM_EXPORT("arena_cap") uint32_t arena_cap(void) {
  return ARENA_CAP;
}
WASM_EXPORT("scores_ptr") uint32_t scores_ptr(void) {
  return (uint32_t)(uintptr_t)out_scores;
}
WASM_EXPORT("flags_ptr") uint32_t flags_ptr(void) {
  return (uint32_t)(uintptr_t)out_flags;
}

static int bytes_eq(const uint8_t *a, int alen, const uint8_t *b, int blen) {
  if (alen != blen) return 0;
  for (int i = 0; i < alen; i++) {
    if (a[i] != b[i]) return 0;
  }
  return 1;
}

static int is_space(uint8_t c) {
  return c == 0x20 || (c >= 0x09 && c <= 0x0D);
}

/* Lowercase one UTF-8 unit. Returns bytes consumed (1 or 2), writes 1-2 bytes. */
static int lower_unit(const uint8_t *in, int len, uint8_t *out) {
  uint8_t a = in[0];
  if (a < 0x80) {
    uint8_t c = a;
    if (c >= 'A' && c <= 'Z') c = (uint8_t)(c + 32);
    out[0] = c;
    return 1;
  }
  if (a == 0xD0 && len >= 2) {
    uint8_t b = in[1];
    if (b >= 0x80 && b <= 0x8F) { /* Ѐ..Џ -> ѐ..џ */
      out[0] = 0xD1;
      out[1] = (uint8_t)(b + 0x10);
      return 2;
    }
    if (b >= 0x90 && b <= 0x9F) { /* А..П -> а..п */
      out[0] = 0xD0;
      out[1] = (uint8_t)(b + 0x20);
      return 2;
    }
    if (b >= 0xA0 && b <= 0xAF) { /* Р..Я -> р..я */
      out[0] = 0xD1;
      out[1] = (uint8_t)(b - 0x20);
      return 2;
    }
    /* Already lowercase or not a Cyrillic uppercase letter: keep both bytes. */
    out[0] = a;
    out[1] = b;
    return 2;
  }
  out[0] = a;
  return 1;
}

static int is_alnum_ascii(uint8_t c) {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

static int norm_loose(const uint8_t *in, int len, uint8_t *out, int cap) {
  int j = 0, started = 0, pending = 0, i = 0;
  while (i < len) {
    uint8_t buf[2];
    if (in[i] < 0x80 && is_space(in[i])) {
      if (started) pending = 1;
      i++;
      continue;
    }
    int n = lower_unit(in + i, len - i, buf);
    if (pending) {
      if (j < cap) out[j++] = ' ';
      pending = 0;
    }
    for (int k = 0; k < n; k++) {
      if (j < cap) out[j++] = buf[k];
    }
    started = 1;
    i += n;
  }
  return j;
}

static int norm_tight(const uint8_t *in, int len, uint8_t *out, int cap, int keep_space) {
  int j = 0, started = 0, pending = 0, i = 0;
  while (i < len) {
    uint8_t buf[2];
    int n = lower_unit(in + i, len - i, buf);
    i += n;
    int alnum = buf[0] >= 0x80 || is_alnum_ascii(buf[0]);
    if (alnum) {
      if (keep_space && started && pending && j < cap) out[j++] = ' ';
      pending = 0;
      started = 1;
      for (int k = 0; k < n; k++) {
        if (j < cap) out[j++] = buf[k];
      }
    } else if (started) {
      pending = 1;
    }
  }
  return j;
}

typedef struct {
  const uint8_t *p;
  int len;
} Token;

static int tok_eq(Token a, Token b) {
  if (a.len != b.len) return 0;
  for (int i = 0; i < a.len; i++) {
    if (a.p[i] != b.p[i]) return 0;
  }
  return 1;
}

static int tokenize(const uint8_t *s, int len, Token *toks, int max) {
  int n = 0, start = 0;
  for (int i = 0; i <= len; i++) {
    if (i == len || s[i] == ' ') {
      if (i > start && n < max) {
        toks[n].p = s + start;
        toks[n].len = i - start;
        n++;
      }
      start = i + 1;
    }
  }
  return n;
}

static double token_jaccard(const Token *a, int na, const Token *b, int nb) {
  int ua = 0, ub = 0, inter = 0;
  for (int i = 0; i < na; i++) {
    int dup = 0;
    for (int k = 0; k < i; k++) {
      if (tok_eq(a[i], a[k])) {
        dup = 1;
        break;
      }
    }
    if (dup) continue;
    ua++;
    for (int j = 0; j < nb; j++) {
      if (tok_eq(a[i], b[j])) {
        inter++;
        break;
      }
    }
  }
  for (int j = 0; j < nb; j++) {
    int dup = 0;
    for (int k = 0; k < j; k++) {
      if (tok_eq(b[j], b[k])) {
        dup = 1;
        break;
      }
    }
    if (!dup) ub++;
  }
  int uni = ua + ub - inter;
  return uni > 0 ? (double)inter / (double)uni : 1.0;
}

static int levenshtein(const uint8_t *a, int la, const uint8_t *b, int lb) {
  if (la > MAX_LEV_LEN) la = MAX_LEV_LEN;
  if (lb > MAX_LEV_LEN) lb = MAX_LEV_LEN;
  static int16_t r0[MAX_LEV_LEN + 1];
  static int16_t r1[MAX_LEV_LEN + 1];
  for (int j = 0; j <= lb; j++) r0[j] = (int16_t)j;
  for (int i = 1; i <= la; i++) {
    r1[0] = (int16_t)i;
    for (int j = 1; j <= lb; j++) {
      int cost = a[i - 1] == b[j - 1] ? 0 : 1;
      int del = r0[j] + 1;
      int ins = r1[j - 1] + 1;
      int sub = r0[j - 1] + cost;
      int m = del < ins ? del : ins;
      if (sub < m) m = sub;
      r1[j] = (int16_t)m;
    }
    for (int j = 0; j <= lb; j++) r0[j] = r1[j];
  }
  return r0[lb];
}

static int contains(const uint8_t *hay, int hl, const uint8_t *need, int nl) {
  if (nl == 0) return 1;
  if (nl > hl) return 0;
  for (int i = 0; i + nl <= hl; i++) {
    int ok = 1;
    for (int j = 0; j < nl; j++) {
      if (hay[i + j] != need[j]) {
        ok = 0;
        break;
      }
    }
    if (ok) return 1;
  }
  return 0;
}

static double score_current(void) {
  int maxlen = q_tok_len > c_tok_len ? q_tok_len : c_tok_len;
  if (maxlen == 0) return 1.0;
  int d = levenshtein(q_tok, q_tok_len, c_tok, c_tok_len);
  double lev_sim = 1.0 - (double)d / (double)maxlen;
  if (lev_sim < 0.0) lev_sim = 0.0;
  Token ta[MAX_TOKENS];
  Token tb[MAX_TOKENS];
  int na = tokenize(q_tok, q_tok_len, ta, MAX_TOKENS);
  int nb = tokenize(c_tok, c_tok_len, tb, MAX_TOKENS);
  double jac = token_jaccard(ta, na, tb, nb);
  double sc = 0.5 * lev_sim + 0.5 * jac;
  int minc = q_cmp_len < c_cmp_len ? q_cmp_len : c_cmp_len;
  if (minc >= 4 &&
      (contains(q_cmp, q_cmp_len, c_cmp, c_cmp_len) ||
       contains(c_cmp, c_cmp_len, q_cmp, q_cmp_len))) {
    if (sc < 0.9) sc = 0.9;
  }
  if (sc > 1.0) sc = 1.0;
  if (sc < 0.0) sc = 0.0;
  return sc;
}

/* ------------------------------------------------------------------ */
/* Portable core (also used directly by the native sanitizer harness)  */
/* ------------------------------------------------------------------ */

static int32_t normalize_core(int mode, const uint8_t *in, int in_len, uint8_t *out, int out_cap) {
  if (in_len < 0) in_len = 0;
  if (out_cap < 0) out_cap = 0;
  if (mode == 0) return norm_loose(in, in_len, out, out_cap);
  return norm_tight(in, in_len, out, out_cap, mode == 1 ? 1 : 0);
}

static double similarity_core(const uint8_t *a, int a_len, const uint8_t *b, int b_len) {
  int ar = norm_loose(a, a_len, q_raw, MAX_STR);
  q_tok_len = norm_tight(a, a_len, q_tok, MAX_STR, 1);
  q_cmp_len = norm_tight(a, a_len, q_cmp, MAX_STR, 0);
  int br = norm_loose(b, b_len, c_raw, MAX_STR);
  c_tok_len = norm_tight(b, b_len, c_tok, MAX_STR, 1);
  c_cmp_len = norm_tight(b, b_len, c_cmp, MAX_STR, 0);
  if (bytes_eq(q_raw, ar, c_raw, br) || bytes_eq(q_cmp, q_cmp_len, c_cmp, c_cmp_len)) return 1.0;
  return score_current();
}

static uint32_t analyze_core(const uint8_t *q, int q_len, const uint8_t *corpus, int corpus_len,
                             uint32_t max_out) {
  int qr = norm_loose(q, q_len, q_raw, MAX_STR);
  q_tok_len = norm_tight(q, q_len, q_tok, MAX_STR, 1);
  q_cmp_len = norm_tight(q, q_len, q_cmp, MAX_STR, 0);

  uint32_t pos = 0, count = 0;
  while (pos + 4 <= (uint32_t)corpus_len && count < max_out && count < MAX_CANDIDATES) {
    uint32_t slen = (uint32_t)corpus[pos] |
                    ((uint32_t)corpus[pos + 1] << 8) |
                    ((uint32_t)corpus[pos + 2] << 16) |
                    ((uint32_t)corpus[pos + 3] << 24);
    pos += 4;
    if (slen > (uint32_t)corpus_len - pos) break; /* truncated / malformed entry */
    const uint8_t *c = corpus + pos;
    pos += slen;

    int cr = norm_loose(c, (int)slen, c_raw, MAX_STR);
    c_tok_len = norm_tight(c, (int)slen, c_tok, MAX_STR, 1);
    c_cmp_len = norm_tight(c, (int)slen, c_cmp, MAX_STR, 0);

    uint32_t flags = 0;
    if (bytes_eq(q_raw, qr, c_raw, cr)) flags |= 1u;
    if (bytes_eq(q_cmp, q_cmp_len, c_cmp, c_cmp_len)) flags |= 2u;
    double sc = flags ? 1.0 : score_current();

    out_scores[count] = (float)sc;
    out_flags[count] = flags;
    count++;
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* wasm ABI wrappers                                                   */
/* ------------------------------------------------------------------ */

WASM_EXPORT("normalize") int32_t
normalize(uint32_t mode, uint32_t in_ptr, uint32_t in_len, uint32_t out_ptr, uint32_t out_cap) {
  return normalize_core((int)mode, (const uint8_t *)(uintptr_t)in_ptr, (int)in_len,
                        (uint8_t *)(uintptr_t)out_ptr, (int)out_cap);
}

WASM_EXPORT("similarity") double
similarity(uint32_t a_ptr, uint32_t a_len, uint32_t b_ptr, uint32_t b_len) {
  return similarity_core((const uint8_t *)(uintptr_t)a_ptr, (int)a_len,
                         (const uint8_t *)(uintptr_t)b_ptr, (int)b_len);
}

WASM_EXPORT("analyze") uint32_t
analyze(uint32_t q_ptr, uint32_t q_len, uint32_t corpus_ptr, uint32_t corpus_len, uint32_t max_out) {
  return analyze_core((const uint8_t *)(uintptr_t)q_ptr, (int)q_len,
                      (const uint8_t *)(uintptr_t)corpus_ptr, (int)corpus_len, max_out);
}
