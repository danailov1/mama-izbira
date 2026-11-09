/*
 * Native sanitizer harness for native/textmatch.c.
 *
 * Build & run via `npm run test:native` (uses -fsanitize=address,undefined).
 * It fuzzes the normalization/scoring/analyze paths with mixed ASCII, Cyrillic,
 * punctuation, separators and raw high bytes, and checks:
 *   - no out-of-bounds reads/writes (ASan redzones around the static buffers)
 *   - no undefined behavior (UBSan)
 *   - output lengths respect the requested cap (truncation is safe)
 *   - malformed/truncated corpus entries are ignored, never over-read
 *   - max_out is honored and scores stay in [0, 1]
 *   - repeated calls are deterministic
 *
 * The module has no heap allocation, so there is nothing to free/leak; ASan's
 * leak detector runs on exit as an extra guard.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "textmatch.c"

static uint32_t rng_state = 0x12345678u;

static uint32_t rnd(void) {
  rng_state ^= rng_state << 13;
  rng_state ^= rng_state >> 17;
  rng_state ^= rng_state << 5;
  return rng_state;
}

static const char *const WORDS[] = {
    "chicco", "next2me", "peg", "perego", "maxi", "cosi", "nuk", "first", "choice",
    "\xd0\xb1\xd0\xb5\xd0\xb1\xd0\xb5\xd1\x88\xd0\xba\xd0\xb0", /* бебешка */
    "\xd0\xba\xd0\xbe\xd0\xbb\xd0\xb8\xd1\x87\xd0\xba\xd0\xb0", /* количка */
    "\xd0\x96", "\xd1\x8f",                                     /* Ж, я */
    "!!!", "  ", "\t", "\xc3\xb6",                              /* ö */
};

static void fill_random(uint8_t *buf, int len) {
  int i = 0;
  while (i < len) {
    if ((rnd() & 3u) == 0) {
      buf[i++] = (uint8_t)(rnd() & 0xFFu);
      continue;
    }
    const char *w = WORDS[rnd() % (sizeof(WORDS) / sizeof(WORDS[0]))];
    int wl = (int)strlen(w);
    for (int k = 0; k < wl && i < len; k++) buf[i++] = (uint8_t)w[k];
  }
}

static int failures = 0;

#define CHECK(cond, msg)                              \
  do {                                                \
    if (!(cond)) {                                    \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      failures++;                                     \
    }                                                 \
  } while (0)

static void test_normalize_truncation(void) {
  static const char *samples[] = {"chicco next2me", "  Бебешка   количка  ", "A-B_C!!", "", "\xd0\x96\xd1\x8f"};
  for (int m = 0; m <= 2; m++) {
    for (size_t s = 0; s < sizeof(samples) / sizeof(samples[0]); s++) {
      const uint8_t *in = (const uint8_t *)samples[s];
      int len = (int)strlen(samples[s]);
      uint8_t out[64];
      for (int cap = 0; cap <= (int)sizeof(out); cap++) {
        memset(out, 0xAA, sizeof(out));
        int n = normalize_core(m, in, len, out, cap);
        CHECK(n >= 0 && n <= cap, "normalize length respects cap");
        for (int k = cap; k < (int)sizeof(out); k++) {
          CHECK(out[k] == 0xAA, "normalize does not write past cap");
        }
      }
    }
  }
}

static void reset_outputs(void) {
  for (int i = 0; i < MAX_CANDIDATES; i++) {
    out_scores[i] = -123.0f;
    out_flags[i] = 0xDEADBEEFu;
  }
}

static uint32_t run_analyze(const uint8_t *q, int qlen, const uint8_t *corpus, int clen,
                            uint32_t maxout) {
  reset_outputs();
  uint32_t n = analyze_core(q, qlen, corpus, clen, maxout);
  CHECK(n <= maxout, "max_out respected");
  CHECK(n <= MAX_CANDIDATES, "candidate cap respected");
  for (uint32_t i = 0; i < n; i++) {
    CHECK(out_scores[i] >= 0.0f && out_scores[i] <= 1.0f, "analyze score in range");
  }
  for (uint32_t i = n; i < MAX_CANDIDATES; i++) {
    CHECK(out_scores[i] == -123.0f, "no score write past count");
    CHECK(out_flags[i] == 0xDEADBEEFu, "no flag write past count");
  }
  return n;
}

static void test_fuzz_normalize(void) {
  uint8_t in[2048];
  uint8_t out[4096];
  for (int t = 0; t < 3000; t++) {
    int len = (int)(rnd() % sizeof(in));
    fill_random(in, len);
    int n = normalize_core(0, in, len, out, (int)sizeof(out));
    CHECK(n >= 0 && n <= (int)sizeof(out), "loose fuzz length");
    n = normalize_core(1, in, len, out, (int)sizeof(out));
    CHECK(n >= 0 && n <= (int)sizeof(out), "tokens fuzz length");
    n = normalize_core(2, in, len, out, (int)sizeof(out));
    CHECK(n >= 0 && n <= (int)sizeof(out), "compact fuzz length");
  }
}

static void test_similarity_edges(void) {
  CHECK(similarity_core((const uint8_t *)"", 0, (const uint8_t *)"", 0) == 1.0,
        "empty == empty");
  double s = similarity_core((const uint8_t *)"Chicco Next 2 Me", 16,
                             (const uint8_t *)"chicco next2me", 14);
  CHECK(s == 1.0, "compact equality scores 1");
  s = similarity_core((const uint8_t *)"Peg Perego", 10, (const uint8_t *)"\xd0\xb1\xd0\xb5\xd0\xb1\xd0\xb5", 8);
  CHECK(s >= 0.0 && s <= 1.0, "score in range");
}

static void test_analyze_bounds(void) {
  uint8_t corpus[8192];
  uint8_t query[128];
  int qlen = (int)(rnd() % sizeof(query));
  fill_random(query, qlen);

  int entries = 0;
  int pos = 0;
  while (pos + 4 + 60 <= (int)sizeof(corpus) && entries < 200) {
    int len = (int)(rnd() % 60);
    uint32_t u = (uint32_t)len;
    corpus[pos++] = (uint8_t)(u & 0xFF);
    corpus[pos++] = (uint8_t)((u >> 8) & 0xFF);
    corpus[pos++] = (uint8_t)((u >> 16) & 0xFF);
    corpus[pos++] = (uint8_t)((u >> 24) & 0xFF);
    fill_random(corpus + pos, len);
    pos += len;
    entries++;
  }

  uint32_t n = run_analyze(query, qlen, corpus, pos, MAX_CANDIDATES);
  CHECK(n == (uint32_t)entries, "all well-formed entries analyzed");

  /* snapshot the full result before the capped run overwrites the output */
  static float first[MAX_CANDIDATES];
  static uint32_t flags_first[MAX_CANDIDATES];
  memcpy(first, out_scores, sizeof(float) * n);
  memcpy(flags_first, out_flags, sizeof(uint32_t) * n);

  /* max_out is honored */
  uint32_t capped = run_analyze(query, qlen, corpus, pos, 3);
  CHECK(capped <= 3, "max_out honored");

  /* determinism: same input -> same output */
  uint32_t again = run_analyze(query, qlen, corpus, pos, MAX_CANDIDATES);
  CHECK(again == n, "deterministic count");
  for (uint32_t i = 0; i < n; i++) {
    CHECK(first[i] == out_scores[i], "deterministic score");
    CHECK(flags_first[i] == out_flags[i], "deterministic flags");
  }

  /* malformed entry: declared length 0xFFFFFF but no payload -> stop safely */
  corpus[pos++] = 0xFF;
  corpus[pos++] = 0xFF;
  corpus[pos++] = 0xFF;
  corpus[pos++] = 0x7F;
  uint32_t after = run_analyze(query, qlen, corpus, pos, MAX_CANDIDATES);
  CHECK(after == n, "malformed tail entry ignored");

  /* trailing partial header (fewer than 4 bytes) -> stop safely */
  corpus[pos++] = 0x01;
  corpus[pos++] = 0x00;
  uint32_t partial = run_analyze(query, qlen, corpus, pos, MAX_CANDIDATES);
  CHECK(partial == n, "partial header ignored");

  /* empty corpus */
  CHECK(run_analyze(query, qlen, corpus, 0, MAX_CANDIDATES) == 0, "empty corpus");
}

static void test_long_inputs(void) {
  static uint8_t huge[8192];
  memset(huge, 'a', sizeof(huge));
  uint8_t out[8192];
  int n = normalize_core(1, huge, (int)sizeof(huge), out, (int)sizeof(out));
  CHECK(n >= 0 && n <= (int)sizeof(out), "long token normalization is bounded");
  double s = similarity_core(huge, (int)sizeof(huge), huge, (int)sizeof(huge));
  CHECK(s == 1.0, "long identical strings score 1");
}

int main(void) {
  printf("1/5 normalize truncation\n");
  fflush(stdout);
  test_normalize_truncation();
  printf("2/5 fuzz normalize\n");
  fflush(stdout);
  test_fuzz_normalize();
  printf("3/5 similarity edges\n");
  fflush(stdout);
  test_similarity_edges();
  printf("4/5 analyze bounds\n");
  fflush(stdout);
  test_analyze_bounds();
  printf("5/5 long inputs\n");
  fflush(stdout);
  test_long_inputs();

  if (failures == 0) {
    printf("OK: textmatch native sanitizer tests passed\n");
    return 0;
  }
  fprintf(stderr, "%d failure(s)\n", failures);
  return 1;
}
