# мамаИзбира — Full Audit Report

> Generated: 2026-11-09 · Purpose: this file is consumed by a fixing model. Each item contains
> **Problem** (what is wrong and why it matters), **Location** (`file:line`), and **Fix** (concrete steps).
> Severity: `CRITICAL` (breaks a core flow / security) · `HIGH` (visible bug / security gap) · `MEDIUM` (UX/product-quality issue) · `LOW` (polish/hygiene).
>
> Baseline: `npm run build` passes (TS strict). All fixes must keep `npm run build` green.

---

## CRITICAL

### C1. Category browsing is broken — missing composite Firestore index
- **Problem:** Clicking any category chip in the catalog (or on the home page) runs `where(status,==) + where(categoryId,==) + orderBy(createdAt,desc)`. Firestore **requires a composite index** for this combination. It is missing from `firestore.indexes.json`, so the query fails with `FAILED_PRECONDITION`, the `.catch()` swallows the error and the user sees "Няма намерени продукти" even though products exist. This breaks PRD F1 (browse by category).
- **Location:**
  - Query: `src/infra/firebase/firestore/product-repository.firestore.ts:44-49` (`query()` builds `where('status')`, `where('categoryId')`, `orderBy('createdAt','desc')`).
  - Missing index: `firestore.indexes.json` (only `status+createdAt` and `createdBy+createdAt` exist).
  - Silent failure: `src/presentation/pages/CatalogPage.tsx:49` (`.catch(() => active && setLoading(false))` hides the error).
- **Fix:**
  1. Add to `firestore.indexes.json`:
     ```json
     {
       "collectionGroup": "products",
       "queryScope": "COLLECTION",
       "fields": [
         { "fieldPath": "status", "order": "ASCENDING" },
         { "fieldPath": "categoryId", "order": "ASCENDING" },
         { "fieldPath": "createdAt", "order": "DESCENDING" }
       ]
     }
     ```
  2. Deploy: `firebase deploy --only firestore:indexes`.
  3. Also surface query errors in the UI instead of swallowing them: in `CatalogPage.tsx` add an `error` state and render an error `EmptyState`/`Alert` when the fetch rejects.

---

## HIGH

### H1. Product detail page: my review goes stale after edit/delete (no refetch)
- **Problem:** `myReview` is fetched once (`useEffect` on `[id, user]`). After editing (ReviewForm → `onSaved` → `navigate('.', {replace:true})`) or deleting (ReviewCard delete button), the page re-renders but `myReview` still holds the **old** rating/text, so the "Твоето ревю е публикувано" card shows outdated content. After delete, the card remains visible even though the review is gone. Requires a full reload to correct.
- **Location:**
  - Fetch-once: `src/presentation/pages/ProductDetailPage.tsx:78-90`
  - Card rendered from stale state: `src/presentation/pages/ProductDetailPage.tsx:257-268`
  - Delete button does not notify parent: `src/presentation/components/review/ReviewCard.tsx:108-119` (no `onChanged` wired at `ProductDetailPage.tsx:259`).
- **Fix:** Add a `refreshMyReview` callback (or lift a `myReviewVersion` counter) that re-runs `reviews.getMyReview(id, user.id)`; call it from `ReviewForm.onSaved` and pass `onChanged` to the my-review `ReviewCard` in `ProductDetailPage.tsx`. Simplest robust option: make `myReview` a subscription (`subscribeByProduct` already streams reviews — derive `myReview = reviews.find(r => r.userId === user.id)` instead of a separate one-shot fetch).

### H2. VoteWidget: highlight never updates after voting + unhandled promise rejection
- **Problem:**
  1. `myVote` is loaded once on mount (`useEffect` on `[user, productId, reviewId]`). After `toggle()`, the state is never updated, so clicking ↑ then ↓ leaves the ↑ button highlighted (and vice versa) until remount — the core voting interaction visually lies to the user.
  2. `handleVote` has `try/finally` with **no catch**: if `toggle()` rejects (permission-denied, self-vote race, offline) the promise rejection is unhandled and the user gets zero feedback.
- **Location:** `src/presentation/components/ui/VoteWidget.tsx:24-51`
- **Fix:**
  1. Update state optimistically in `handleVote`: after `await toggle(...)`, set `myVote` to the new value returned by the service (have `VoteService.toggle` return the resulting vote type or null — it already knows via `getForReview`/`cast`/`clear` logic), or compute locally: if `myVote === type` → `null`, else → `type`.
  2. Add `catch` that calls `showToast(...)` with the error message (import `useToast`).

### H3. Firestore rules gaps: reviews/votes can bypass domain validation
- **Problem:** The domain layer validates review input and product status, but a malicious client can write directly to Firestore. Current rules **do not** enforce:
  - `reviews` create: no check that `text is string`, no `createdAt is timestamp`, no `keys().hasOnly(...)` (any extra fields allowed), and — most importantly — **no check that the parent product `status == 'approved'`** (reviews can be written to pending/rejected products).
  - `votes` create/update: **no check that the review `status == 'visible'`** (votes can be cast on removed reviews, silently inflating scores).
- **Location:** `firestore.rules`
  - Reviews create: lines 118-128
  - Votes create/update: lines 144-152
- **Fix:**
  1. In `match /products/{productId} /reviews/{reviewUserId}` `allow create`, add:
     - `request.resource.data.keys().hasOnly(['productId','userId','rating','text','upvotes','downvotes','netScore','status','createdAt','updatedAt'])`
     - `request.resource.data.text is string`
     - `request.resource.data.createdAt is timestamp && request.resource.data.updatedAt is timestamp`
     - `get(/databases/$(database)/documents/products/$(productId)).data.status == 'approved'`
  2. In the nested `match /votes/{voterId}` `allow create, update`, add:
     - `get(/databases/$(database)/documents/products/$(productId)/reviews/$(reviewUserId)).data.status == 'visible'`
  3. Deploy rules and re-test review create + vote flows.

### H4. Guest/unauthorized user opening a pending/rejected product → infinite skeleton + unhandled rejection
- **Problem:** For non-owners, Firestore rules deny reads of non-approved products. On `ProductDetailPage`, `catalog.getProduct(id)` rejects (no `.catch` → unhandled rejection) and `subscribeById`'s error handler only does `console.error`, so `product` stays `null` and the page shows the loading skeleton **forever**.
- **Location:**
  - `src/presentation/pages/ProductDetailPage.tsx:42-56` (`getProduct` has no catch)
  - `src/infra/firebase/firestore/product-repository.firestore.ts:74-80` (`subscribeById` error path only logs)
- **Fix:** In the page, `.catch(() => active && setNotFound(true))` on `getProduct`; also treat permission-denied in `subscribeById` as `cb(null)` (or extend the port with an error callback) so the UI renders the existing "Продуктът не е намерен" empty state instead of an endless skeleton.

### H6. Bottom navigation is broken/duplicated
- **Problem:** The mobile bottom nav has **5 items**: Начало → `/`, Категории → `/catalog`, FAB (+), Профил (heart icon) → `/profile|/auth`, and **"Аз" (person icon) → `/catalog`** — a second, duplicate link to the catalog with a mismatched label/icon. Confusing for users; also moderators have no way to reach `/admin` on mobile at all (`Navbar` links are hidden under 760px).
- **Location:** `src/presentation/components/layout/BottomNav.tsx:9-29`; `src/presentation/components/layout/Navbar.tsx:14-18` (`.nav-links` display:none on mobile in `design-system.css:94,110`)
- **Fix:** Reduce to 4 slots: Начало (`home`), Каталог (`category` → `/catalog`), FAB, Профил (`person` → `user ? '/profile' : '/auth'`). Remove the duplicate "Аз" entry and the heart icon misuse. For moderators: when `isModerator(user)`, either add a 5th nav item "Модерация" (`shield`) or surface an admin link inside ProfilePage.

---

## MEDIUM

### M1. Search/sort are applied client-side after a hard limit → wrong results, misleading sort
- **Problem:**
  1. `query()` fetches up to `limit` (60 catalog / 200 elsewhere) **newest** approved products and then filters by search/minRating **in memory**. Any product older than the cutoff is invisible to search. Same for `sort: 'top'|'rating'` — they only sort within the fetched window.
  2. The catalog tab labeled "Най-полезни" (`sort === 'top'`) actually sorts by `reviewsCount` — misleading (users expect usefulness = upvote score, as per the Reddit-like model in the PRD).
- **Location:**
  - `src/infra/firebase/firestore/product-repository.firestore.ts:44-66`
  - Sort labels: `src/presentation/pages/CatalogPage.tsx:108-118`
- **Fix:**
  1. Search: store a normalized lowercase field (e.g. `searchName = norm(brand)+' '+norm(model)`) at create time and query with `where('searchName','>=',prefix) / where('searchName','<=',prefix+'\uf8ff')` (add the needed composite index with `status`), or accept an ordered fetch with real pagination/infinite scroll (PRD §4 requires it anyway).
  2. Rename the tab to "Най-коментирани" if it stays `reviewsCount`-based; if you want true usefulness, sort client-side by `avgRating*log(reviewsCount+1)` or add a stored `usefulness` score.
  3. Implement cursor-based pagination (startAfter last doc) + "Зареди още" button instead of fixed `limit`.

### M2. Home page: eternal skeletons on empty catalog + stats capped at 200
- **Problem:**
  1. `topProducts.length === 0` always renders skeleton cards — if the catalog genuinely has 0 approved products, users see shimmering placeholders forever.
  2. Stats (`Одобрени продукта`, `Ревюта`) are computed from `getApproved({limit: 200})` — wrong as soon as there are more than 200 products.
- **Location:** `src/presentation/pages/HomePage.tsx:78-94` (skeleton) and `:19-24, 96-117` (stats)
- **Fix:**
  1. Add a `loading` state: show skeletons only while loading; when loaded and empty, show a real empty state (or hide the section).
  2. Use Firestore aggregate queries (`getCountFromServer` on `products` where status==approved, and `getAggregateFromServer` sum on the `reviews` collection group) for accurate stats, or display approximate values with a "+" suffix and honest labeling.

### M3. Guests can open the report modal but submit silently does nothing
- **Problem:** The "Докладвай" button renders for guests (it only hides for the review author). Opening the modal works, but `submitReport` early-returns when `!user`, so the click does nothing — no redirect, no toast, no error. Inconsistent with voting, which redirects to login.
- **Location:** `src/presentation/components/review/ReviewCard.tsx:42-52` (submit) and `:96-101` (button render)
- **Fix:** Reuse the `requireAuth()` pattern from the vote widget: if `!session`, show toast + `navigate('/auth')` when the report button is clicked (or when submitting). Hide the button entirely for guests if you prefer.

### M4. `imageUrl` is dead weight — collected but never rendered or validated
- **Problem:** The add-product form collects an image URL (`type="url"`), it is stored in Firestore, but **no component ever renders it** (cards and detail page always show a category-icon thumb). No validation either (no `<form>`, so the native `type="url"` check never fires; any garbage string is stored).
- **Location:**
  - Input: `src/presentation/components/product/ProductForm.tsx:153-161`
  - Never rendered: `src/presentation/components/product/ProductCard.tsx:13-15` and `src/presentation/pages/ProductDetailPage.tsx:172-174`
- **Fix:** Decide: either (a) render the image in `ProductCard`/detail with an `onError` fallback to the icon thumb, add a simple URL validation in `ProductService.addProduct` (e.g. `new URL(input.imageUrl).protocol is http/https`, else reject), or (b) remove the field from the form/entity/repo/rules for the MVP. Option (a) is closer to PRD F14.

### M5. Google sign-in via popup is unreliable on mobile (mobile-first product)
- **Problem:** `signInWithPopup` is frequently blocked/broken in mobile Safari and in-app browsers. The PRD explicitly targets mobile-first usage (parents browsing on phones), so Google login — a primary auth path — can silently fail for the main audience.
- **Location:** `src/infra/firebase/auth/auth-gateway.firebase.ts:37-41`
- **Fix:** Use `signInWithRedirect` + `getRedirectResult` for Google (either always, or when a mobile UA is detected). Keep popup for desktop if desired. Note: redirect flow must call `getRedirectResult()` on app start to complete the sign-in after the browser returns.

### M6. `getByEmail` is broken (looks up a user doc by email as the uid)
- **Problem:** `getByEmail(email)` does `getDoc(doc(db,'users', email.toLowerCase()))` — i.e. it treats the email as a document id. Users are keyed by auth uid, so this can **never** find a real user. The method is dead code today, but any future caller gets silently wrong behavior.
- **Location:** `src/infra/firebase/firestore/user-repository.firestore.ts:30-34`; port `src/core/domain/ports/user-repository.ts:5`
- **Fix:** Either implement correctly (`query(collection(db,'users'), where('email','==',email), limit(1))` — needs a single-field index, fine) or remove it from the port and implementation since nothing uses it.

### M7. Moderators can never change the status of an already-decided product; copy is misleading
- **Problem:** The admin Products tab subscribes only to `status == 'pending'`. If a moderator approves/rejects by mistake, there is no UI to fix it. The product detail page tells moderators "Можеш да промениш статуса от опашката" — but rejected/approved products are **not in the queue**, so that instruction is false.
- **Location:**
  - `src/presentation/pages/admin/ProductsTab.tsx:24` (`subscribePending` only)
  - `src/presentation/pages/ProductDetailPage.tsx:303-311` (moderator info copy)
  - `src/infra/firebase/firestore/product-repository.firestore.ts:122-129`
- **Fix:** Add an "Всички" (or "Решени") tab/filter in ProductsTab listing approved/rejected products with actions (approve/reject again); or add approve/reject buttons to the moderator panel on the product detail page. Fix the copy accordingly. (Rules already allow moderators to set status on any product — only the UI is missing.)

### M8. Footer contains developer-facing text
- **Problem:** The site footer reads "мамаИзбира · Ревюта от реални родители · Икони: Material Symbols Rounded" — the font-credit note is implementation noise that confuses end users and looks unpolished.
- **Location:** `src/presentation/components/layout/Layout.tsx:12`
- **Fix:** Replace with real footer content (e.g. "мамаИзбира · Ревюта от реални родители" + links to Каталог/Вход/Добави продукт, © year). Move any font attribution to a comment in `index.html`.

### M9. Accessibility: clickable cards and icon "buttons" are not keyboard-accessible
- **Problem:**
  1. `ProductCard` is a `<div role="link">` with an `onClick` — it is not focusable and does not respond to Enter/Space, and `role="link"` without `tabindex` is an ARIA violation.
  2. `Msr` icons are used as clickable controls (modal close at `Modal.tsx:17`, search clear at `CatalogPage.tsx:85-87`) — they are `<span aria-hidden="true">` with no keyboard support and are invisible to screen readers.
- **Location:** `src/presentation/components/product/ProductCard.tsx:11`; `src/presentation/components/ui/Modal.tsx:13-22`; `src/presentation/components/ui/Msr.tsx:22`; `src/presentation/pages/CatalogPage.tsx:85-87`
- **Fix:** Wrap `ProductCard` content in a real `<Link to={...}>` (keep the card styling). Replace clickable `Msr` spans with real `<button className="icon-btn">` + `aria-label` (keep `Msr` purely decorative inside). Remove `onClick` from `Msr`'s API surface or at least stop using it.

### M10. Modal lacks Escape handling and focus management
- **Problem:** The report/reject modals cannot be dismissed with Escape, focus is not moved into the modal or trapped (keyboard users tab out to the page behind), and the close control is an aria-hidden span (see M9).
- **Location:** `src/presentation/components/ui/Modal.tsx`
- **Fix:** Add `useEffect` with a `keydown` listener (Escape → `onClose`), `role="dialog"` + `aria-labelledby`, autofocus the first focusable element on open, and restore focus to the trigger on close. Make the close button a real `<button aria-label="Затвори">`.

### M11. AuthPage error UX: wrong heading + stale error across modes
- **Problem:**
  1. All auth failures (login, register, password reset) render under the heading "Неуспешно влизане" — wrong for registration and reset flows.
  2. The context `error` is cleared only on the next `run()`; switching login↔register keeps showing the old error (only `localError` is reset).
- **Location:** `src/presentation/pages/AuthPage.tsx:156-161` (heading) and `:170-179` (mode switch)
- **Fix:** Derive the heading from `mode`/action ("Неуспешен вход" / "Неуспешна регистрация" / "Неуспешно изпращане"). Expose a `clearError()` from `AuthContext` and call it on mode switch. Consider clearing `info` when switching modes too.

### M12. Duplicate-product detection is too strict and looks only at the 200 newest
- **Problem:** `searchDuplicates` requires **exact** normalized `brand` and `model` equality — "Chicco Next2Me" vs "Chicco Next 2 Me" is missed; both the check and the live suggestions only scan `limit(500/200)` newest approved products, so real duplicates in a larger catalog slip through. `suggestDuplicates` returns a constant `score: 1`, so "best matches" ordering is fake.
- **Location:**
  - `src/infra/firebase/firestore/product-repository.firestore.ts:105-111` (`searchDuplicates`)
  - `src/core/usecases/product-service.ts:39-46, 59-64`
- **Fix:** Normalize harder (lowercase, strip punctuation, collapse spaces, maybe strip diacritics) and tokenize; for suggestions use the `searchName` prefix query from M1 with a real similarity score (e.g. token overlap) and sort by it. At minimum remove the hard `limit` for the duplicate check (use pagination or an unbounded `searchName` range query).

### M13. Removing an already-removed review leaves the report stuck in "new" forever
- **Problem:** `removeReportedReview` calls `reviews.moderateRemove`, which throws `not_found` when the review is already `removed` (e.g. another moderator handled it). The error aborts before `markHandled`, so the report can never be closed from the UI.
- **Location:** `src/core/usecases/moderation-service.ts:29-33`; `src/core/usecases/review-service.ts:77-84`
- **Fix:** In `removeReportedReview`, fetch the review first; if it is null or already `removed`, still call `reports.markHandled(report.id, moderator.id)` and return. Show an info toast in `ReportsTab` for that case.

---

## LOW

### L1. Broken Bulgarian pluralization in ProductCard and stats
- **Problem:** `ProductCard` renders "1 ревюта" for a single review; HomePage stats render "1 продукта". The detail page does it correctly (`1 ревю / N ревюта`).
- **Location:** `src/presentation/components/product/ProductCard.tsx:30`; `src/presentation/pages/HomePage.tsx:100`
- **Fix:** Extract a `plural(n, 'ревю', 'ревюта')` helper into `src/presentation/lib/format.ts` and use it in all three places.

### L2. Quote typo in CategoriesTab toast
- **Problem:** `Категорията „${c.name}" е активна` mixes „ and " (should be „…“).
- **Location:** `src/presentation/pages/admin/CategoriesTab.tsx:60-63`
- **Fix:** Use `„${c.name}“`.

### L4. AdminPage subscribes to moderation streams for non-moderators
- **Problem:** The `useEffect` runs before the `isModerator` guard, so every guest who opens `/admin` starts two Firestore listeners (pending queue, reports) that waste reads and log permission errors.
- **Location:** `src/presentation/pages/admin/AdminPage.tsx:20-30`
- **Fix:** Move the subscriptions into a child component (e.g. `<AdminDashboard />`) rendered only after the `isModerator` check passes.

### L5. Native `window.confirm` breaks design consistency
- **Problem:** Delete review / moderator remove / report-remove flows use `window.confirm`, which looks nothing like the designed Modal and is jarring. (Modals are already used elsewhere in the same components.)
- **Location:** `src/presentation/components/review/ReviewCard.tsx:56, 111`; `src/presentation/pages/admin/ReportsTab.tsx:76`
- **Fix:** Replace with the existing `Modal` component (title, message, danger confirm button), consistent with the reject-product flow in `ProductsTab`.

### L6. `tsconfig.tsbuildinfo` is tracked in git
- **Problem:** Build artifact committed to the repo; will churn on every build.
- **Location:** repo root (`tsconfig.tsbuildinfo`); `.gitignore`
- **Fix:** `git rm --cached tsconfig.tsbuildinfo` and add `*.tsbuildinfo` to `.gitignore`.

### L7. Orphaned vote documents after review removal/deletion
- **Problem:** `reviews.remove` / `setRemoved` never delete the nested `votes/{userId}` subcollection. Firestore keeps orphaned subcollection docs after parent deletion (they stay readable under the `allow read: if true` vote rule, and keep consuming storage).
- **Location:** `src/infra/firebase/firestore/review-repository.firestore.ts:112-138`
- **Fix:** In the same transaction (or a batched write), read and delete all vote docs under `products/{pid}/reviews/{rid}/votes` when removing a review. Note: this requires a read inside the transaction — use `getDocs` before `runTransaction` and include deletes in `tx`, or leave votes on `setRemoved` (review is only hidden) but clean them up on hard `remove`.

### L8. Static document title; no per-page titles/SEO
- **Problem:** `<title>` is fixed ("мамаИзбира — ревюта на детски продукти") for every route; no per-product title/description, no Open Graph tags.
- **Location:** `index.html:6-7`; no title management in pages
- **Fix:** Add a tiny `usePageTitle(title)` hook (or set `document.title` in each page's effect, e.g. "Chicco Best Friend — мамаИзбира"), and add basic OG tags in `index.html`.

### L9. Naming/type confusion: `Review.reviewId` is really a userId
- **Problem:** The report entity documents `reviewId` as "id на ревюто в subcollection-а (== userId на автора)" and the code calls `getMyReview(productId, r.reviewId)` — reading like a bug even though it works because the review doc id equals the author's uid.
- **Location:** `src/core/domain/entities/review.ts:38-39`; `src/presentation/pages/admin/ReportsTab.tsx:43`
- **Fix:** Either rename report fields to `reviewUserId`/`reviewAuthorId` or add a `ReviewRepository.getById(productId, reviewId)` method with a clear doc comment. Add the same comment to the Report entity.

### L10. `timeAgo` shows "току-що" for future timestamps
- **Problem:** Negative diff (clock skew / future dates) falls into the first branch.
- **Location:** `src/presentation/lib/format.ts:9-10`
- **Fix:** Guard: `if (diff < 0) return formatDate(ts)`.

### L11. `DuplicateSuggestion.score` is a constant — dead parameter
- **Problem:** `suggestDuplicates` returns `score: 1` for every result, so the "score" field and any ordering by it are meaningless.
- **Location:** `src/core/usecases/product-service.ts:7-10, 59-64`
- **Fix:** Compute a real score (token overlap / normalized similarity) or drop the field entirely.

### L12. Toast timers are never cleared on unmount
- **Problem:** `setTimeout` in `showToast` isn't cleaned up; if the provider unmounts it can call `setState` on an unmounted component (harmless warning in React 18, but sloppy).
- **Location:** `src/presentation/components/ui/Toast.tsx:24-28`
- **Fix:** Keep a ref of active timers and clear them in a provider-level `useEffect` cleanup.

### L13. "Изчисти филтрите" does not actually clear local filters
- **Problem:** The empty-state action links to `/catalog`, but `search` and `minRating` are component-local state; the route doesn't change, so the filters stay applied.
- **Location:** `src/presentation/pages/CatalogPage.tsx:159-163`
- **Fix:** Replace the `Link` with a `<button>` that calls `setSearch('')`, `setMinRating(0)`, `setCategory('')`.

---

## Product-readiness checklist (not bugs, but required before launch)

1. **No test suite.** Architecture (ports + DI) makes domain services easily testable with fakes — add at least unit tests for `ReviewService`, `VoteService`, `ProductService` (validation, duplicate/self-vote/self-report rules, toggle semantics). No test runner is configured (`package.json` has no `test` script).
2. **No linter.** Add ESLint (+ Prettier) config and an `npm run lint` script; run it in CI.
3. **No README.md** at repo root for developers (only `docs/`).
4. **PRD §4: pagination/infinite scroll** is not implemented (see M1) — required by the requirements doc.
5. **PRD §4 accessibility baseline** (contrast, alt text, keyboard navigation) — partially addressed in M9/M10; run a quick axe/WAVE pass before launch.
6. **Deployment/rollout docs**: `firebase.json` has no `hosting` section; if the plan is Firebase Hosting, add it with a rewrite of `**` → `/index.html` (SPA routing) — otherwise deep links (e.g. `/products/xyz`) 404 on any static host without rewrites (Vercel needs `vercel.json`).
7. **Security follow-up (post-MVP)**: D-011 accepts that any logged-in user can mutate aggregate counters via raw writes; plan the Cloud Functions migration noted in the decision log.
